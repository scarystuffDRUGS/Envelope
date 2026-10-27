import { describe, expect, it } from 'vitest';
import { describeStage } from './stage';

// The Coffee Shop programme: 1 month excavation, 3 structure, 3 finishing; 2 floors, no basement.
const schedule = [
  { id: 'excavation', label: 'Excavation', months: 1 },
  { id: 'structure', label: 'Structure', months: 3 },
  { id: 'finishing', label: 'Finishing', months: 3 },
] as const;
const base = { floors: 2, basements: 0, schedule, emissions: null };

describe('construction stage card text', () => {
  it('excavation without a basement digs foundations; next month the structure starts', () => {
    const t = describeStage({ ...base, month: 1 });
    expect(t.title).toBe('Month 1 of 7 · Excavation');
    expect(t.now).toBe('Clearing the plot and digging the foundations: 100% done.');
    expect(t.next).toBe('Next month the structure phase starts. The building is complete in month 7.');
  });

  it('structure month 2 of 3: 1 of 2 floors cast, floor 2 in formwork (2 × 2/3 = 1.33)', () => {
    const t = describeStage({ ...base, month: 3 });
    expect(t.now).toBe(
      'RCC frame: 1 of 2 floors cast; floor 2 is in formwork, with rebar and concrete arriving.',
    );
    expect(t.next).toContain('the frame reaches 2 of 2 floors');
  });

  it('finishing: envelope share, then complete in the last month', () => {
    expect(describeStage({ ...base, month: 5 }).now).toContain('33% closed');
    const last = describeStage({ ...base, month: 7 });
    expect(last.now).toMatch(/^Building complete/);
    expect(last.next).toBe('Last month of the programme.');
  });

  it('names the two largest dust sources, or says the site is not working', () => {
    const e = { activity: 3, erosion: 0, handling: 1, haul: 0.1, trackout: 0.02, total: 4.12 };
    expect(describeStage({ ...base, month: 3, emissions: e }).dust).toBe(
      'Main dust sources at the selected hour: general construction activity and material handling.',
    );
    const off = { activity: 0, erosion: 0, handling: 0, haul: 0, trackout: 0, total: 0 };
    expect(describeStage({ ...base, month: 3, emissions: off }).dust).toMatch(/^No dusty work/);
  });
});
