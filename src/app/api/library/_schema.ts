import { z } from 'zod';

const opt = (max: number) => z.string().trim().max(max).nullish();

export const BookBody = z.object({
  title: z.string().trim().min(1, 'Give the book a title').max(300),
  authors: opt(300),
  isbn: opt(20),
  publisher: opt(200),
  edition: opt(60),
  publishedYear: z.coerce.number().int().min(1450).max(2200).nullish(),
  shelf: opt(120),
  totalCopies: z.coerce.number().int().min(0).max(10000),
  subjectId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
});

export const BookPatch = BookBody.partial().extend({ isActive: z.boolean().optional() });
