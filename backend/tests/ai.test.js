'use strict';
const ai = require('../src/services/ai');

afterEach(() => jest.restoreAllMocks());

describe('AI client', () => {
  test('uses the AI service response when available', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ severity: 'medium', summary: 'ok', recommendedActions: ['a'], confidence: 0.7, source: 'llm' }),
    });
    const t = await ai.triage({ trigger: 'manual' });
    expect(t).toEqual({ severity: 'medium', summary: 'ok', recommendedActions: ['a'], confidence: 0.7, source: 'llm' });
    expect(spy.mock.calls[0][0]).toMatch(/\/triage$/);
    expect(spy.mock.calls[0][1].signal).toBeDefined();
  });

  test('triage falls back to rules when the service is down', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await ai.triage({ trigger: 'sos' })).severity).toBe('high');
    expect((await ai.triage({ trigger: 'route_deviation' })).severity).toBe('medium');
    expect((await ai.triage({ trigger: 'timer_expired', medical: { conditions: ['Asthma'] } })).severity).toBe('high');
    expect((await ai.triage({ trigger: 'impact', impact: { peakG: 9 } })).severity).toBe('critical');
    expect((await ai.triage({ trigger: 'impact', impactScore: { classification: 'vehicle_crash', peakG: 6.5 } })).severity).toBe('critical');
    const t = await ai.triage({ trigger: 'manual', note: 'chest pain and sweating' });
    expect(t).toMatchObject({ severity: 'critical', source: 'rules' });
  });

  test('invalid AI response also falls back', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ nonsense: true }) });
    expect((await ai.triage({ trigger: 'sos' })).source).toBe('rules');
  });

  test('chat fallback gives a calm reply pointing to emergency services', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));
    const r = await ai.chat({ messages: [{ role: 'user', content: 'my friend is bleeding a lot' }] });
    expect(r.source).toBe('rules');
    expect(r.reply).toMatch(/112/);
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions.length).toBeLessThanOrEqual(4);
    expect(r.videoIds).toContain('bleeding');
  });

  test('local motion scoring classifies a vehicle crash and a fall', () => {
    const crash = [];
    for (let i = 0; i < 150; i++) crash.push({ t: i * 20, ax: 0, ay: 0, az: i === 50 ? 7.5 : 1, gx: 0, gy: 0, gz: 0 });
    expect(ai.rulesMotionScore({ samples: crash })).toMatchObject({ impactDetected: true, classification: 'vehicle_crash', peakG: 7.5 });

    const fall = [];
    for (let i = 0; i < 200; i++) {
      let az = 1;
      if (i >= 40 && i < 52) az = 0.1; // 240 ms free fall
      if (i === 52) az = 4;
      fall.push({ t: i * 20, ax: 0, ay: 0, az, gx: 0, gy: 0, gz: 0 });
    }
    const f = ai.rulesMotionScore({ samples: fall });
    expect(f.classification).toBe('fall');
    expect(f.freeFallMs).toBeGreaterThanOrEqual(150);
    expect(f.stillnessAfter).toBe(true);

    expect(ai.rulesMotionScore({ samples: crash.map((s) => ({ ...s, az: 1 })) }).impactDetected).toBe(false);
  });

  test('health() is false when the service is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));
    expect(await ai.health()).toBe(false);
  });
});
