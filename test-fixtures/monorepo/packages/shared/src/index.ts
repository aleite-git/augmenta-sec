import {z} from 'zod';

export const userSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'viewer']),
});

export type User = z.infer<typeof userSchema>;

export function validateUser(data: unknown) {
  const result = userSchema.safeParse(data);
  if (result.success) {
    return {success: true as const, data: result.data, error: null};
  }
  return {success: false as const, data: null, error: result.error.flatten()};
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {style: 'currency', currency}).format(
    amount,
  );
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
