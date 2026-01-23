import { describe, it, expect } from 'vitest';
import { filterAdults } from './user-code';

describe('filterAdults', () => {
  it('returns only users with age >= 18', () => {
    const users = [{ age: 17 }, { age: 18 }, { age: 22 }];
    const result = filterAdults(users);
    expect(result.map((u) => u.age)).toEqual([18, 22]);
  });

  it('includes users who are exactly 18', () => {
    const users = [{ age: 18 }, { age: 17 }];
    expect(filterAdults(users).map((u) => u.age)).toEqual([18]);
  });

  it('returns an empty array when given an empty array', () => {
    expect(filterAdults([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const users = [{ age: 18 }, { age: 22 }];
    const snapshot = users.slice();
    filterAdults(users);
    expect(users).toEqual(snapshot);
  });
});
