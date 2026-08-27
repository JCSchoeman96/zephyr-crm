import { describe, expect, it, vi } from 'vitest';
import { createAuthStateLoader } from './auth-state';

describe('request auth state', () => {
	it('shares one user/profile lookup across concurrent server loads', async () => {
		const getUser = vi.fn(async () => ({
			data: { user: { id: 'user-1', email: 'staff@example.test' } },
			error: null
		}));
		const maybeSingle = vi.fn(async () => ({
			data: { id: 'user-1', status: 'active' },
			error: null
		}));
		const supabase = {
			auth: { getUser },
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({ maybeSingle }))
				}))
			}))
		} as never;

		const getAuthState = createAuthStateLoader(supabase);
		const [first, second] = await Promise.all([getAuthState(), getAuthState()]);

		expect(first).toEqual(second);
		expect(first.profile?.status).toBe('active');
		expect(getUser).toHaveBeenCalledTimes(1);
		expect(maybeSingle).toHaveBeenCalledTimes(1);
	});
});
