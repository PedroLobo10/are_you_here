import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/core';
import { getTodayPlan, localDay, studyMinutesToday } from '../src/planner';
import { freshState } from '../src/storage';
import type { AppState, Question, Review, Topic } from '../src/types';

const date = '2026-10-14T12:00:00Z';
function populated(): AppState {
  const app = freshState();
  app.questions = [];
  app.topics = ['A', 'B', 'C'].map(id => ({ id, name: `Tópico ${id}`, discipline: `Disciplina ${id}`, block: 'general', status: 'not-started', difficulty: 3, verified: false } satisfies Topic));
  for (let i = 0; i < 40; i++) {
    const topic = app.topics[i < 30 ? 0 : i < 35 ? 1 : 2];
    app.questions.push({ ...freshState().questions[0], id: `q${i}`, statement: `Item ${i}`, board: 'Cebraspe', origin: 'official', isDemo: false, answer: 'C', topicId: topic.id, topic: topic.name, discipline: topic.discipline } satisfies Question);
  }
  return app;
}
function due(questionId: string, id: string): Review {
  return { id, questionId, sessionId: 'prior', dueAt: '2026-10-13T12:00:00Z', stage: 0, reason: 'error', errorType: 'Falta de conhecimento', concept: '', note: '', isDemo: false };
}
afterEach(() => vi.useRealTimers());

describe('daily adaptive planning', () => {
  it('keeps the whole seven-day calendar within 24 hours, including a planned rest day',()=>{
    vi.useFakeTimers();const app=populated();let minutes=0;
    for(let day=12;day<=18;day++){vi.setSystemTime(new Date(`2026-10-${day}T12:00:00Z`));const plan=getTodayPlan(app);minutes+=plan.reduce((n,t)=>n+t.minutes,0);if(day===18)expect(plan[0].id).toBe('rest');}
    expect(minutes).toBe(1440);
  });
  it('allocates the configured 24-hour week exactly and keeps reduced days within their budget', () => {
    const app = populated();
    const daily = getTodayPlan(app);
    expect(daily.reduce((sum, task) => sum + task.minutes, 0)).toBe(240);
    expect(daily.reduce((sum, task) => sum + task.minutes, 0) * app.profile.daysPerWeek).toBe(1440);
    for (const dailyMinutes of [15, 17, 37, 239, 241, 720]) {
      app.profile.dailyMinutes = dailyMinutes;
      for (const reducedDay of [false, true]) {
        app.profile.reducedDay = reducedDay;
        const plan = getTodayPlan(app);
        expect(plan.every(task => task.minutes >= 0 && Number.isInteger(task.minutes))).toBe(true);
        expect(plan.reduce((sum, task) => sum + task.minutes, 0)).toBe(reducedDay ? Math.min(60, dailyMinutes) : dailyMinutes);
      }
    }
  });

  it('makes the initial diagnostic broad instead of filling it with only the highest-priority topic', () => {
    const app = populated();
    const diagnostic = getTodayPlan(app)[0];
    expect(diagnostic.mode).toBe('diagnostic');
    const disciplines = new Set(diagnostic.questionIds!.map(id => app.questions.find(q => q.id === id)!.discipline));
    expect(disciplines.size).toBe(3);
  });

  it('does not call an empty diagnostic a completed baseline', () => {
    const app = populated();
    const empty = createSession(app, 'diagnostic', [app.questions[0].id], date);
    empty.status = 'completed';
    empty.completedAt = date;
    app.sessions = [empty];
    expect(getTodayPlan(app)[0].mode).toBe('diagnostic');
  });

  it('selects available repeated practice after novel items are exhausted', () => {
    const app = populated();
    const completed = createSession(app, 'diagnostic', app.questions.map(q => q.id), date);
    completed.status = 'completed';
    completed.completedAt = date;
    completed.attempts = completed.attempts.map(attempt => ({ ...attempt, answer: 'C', initial: 'C', submitted: true, submittedAt: date, presentedAt: date, confidenceRecorded: true }));
    app.sessions = [completed];
    expect(getTodayPlan(app)[0].questionIds!.length).toBeGreaterThan(0);
  });

  it('can continue the diagnosis when all earlier items were omitted and no judged baseline exists', () => {
    const app = populated();
    const completed = createSession(app, 'diagnostic', app.questions.map(q => q.id), date);
    completed.status = 'completed';
    completed.completedAt = date;
    completed.attempts = completed.attempts.map(attempt => ({ ...attempt, answer: null, initial: null, submitted: true, submittedAt: date, presentedAt: date, confidenceRecorded: true }));
    app.sessions = [completed];
    const task = getTodayPlan(app)[0];
    expect(task.mode).toBe('diagnostic');
    expect(task.questionIds!.length).toBeGreaterThan(0);
  });

  it('does not remove an unseen placeholder from the available novel sample', () => {
    const app = populated();
    const completed = createSession(app, 'diagnostic', ['q1', 'q0'], date);
    completed.status = 'completed';
    completed.completedAt = date;
    completed.attempts[0] = { ...completed.attempts[0], answer: 'C', initial: 'C', submitted: true, submittedAt: date, confidenceRecorded: true };
    completed.attempts[1] = { ...completed.attempts[1], submitted: true, submittedAt: date, presentedAt: '' };
    app.sessions = [completed];
    expect(getTodayPlan(app)[0].questionIds).toContain('q0');
  });

  it('filters due revisions whose questions disappeared, were annulled, or lack an answer key', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(date));
    const app = populated();
    app.questions[1].keyStatus = 'annulled';
    app.questions[2].answer = null;
    app.reviews = [due('q0', 'live'), due('q1', 'annulled'), due('q2', 'no-key'), due('deleted', 'missing'), { ...due('q3', 'demo'), isDemo: true }];
    const review = getTodayPlan(app).find(task => task.id === 'review')!;
    expect(review.questionIds).toEqual(['q0']);
  });

  it('uses the same Brazil calendar day shown in the dashboard at the UTC midnight boundary', () => {
    expect(localDay(new Date('2026-10-15T01:30:00Z'))).toBe('2026-10-14');
  });

  it('counts real time even in unfinished or abandoned study, without importing demo or unseen time', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(date));
    const app = populated();
    app.studyLogs = [{ id: 'real', date: localDay(), minutes: 30, category: 'theory', isDemo: false }, { id: 'demo', date: localDay(), minutes: 99, category: 'theory', isDemo: true }];
    const s = createSession(app, 'learning', ['q0'], date);
    s.attempts[0] = { ...s.attempts[0], submitted: true, submittedAt: date, elapsedMs: 120_000 };
    app.sessions = [s, { ...s, id: 'abandoned', status: 'abandoned' }, { ...s, id: 'demo', isDemo: true }, { ...s, id: 'unfinished', attempts:[{...s.attempts[0],submitted:false}] }, { ...s, id: 'unseen', attempts:[{...s.attempts[0],submitted:false,presentedAt:''}] }];
    expect(studyMinutesToday(app)).toBe(36);
  });
});
