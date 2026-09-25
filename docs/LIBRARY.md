# Library

The library has two parts, and each is shown only when its module is on:

| Part | Flag | What it is |
|---|---|---|
| **Books** | `library_enabled` (off by default, PROFESSIONAL) | A physical-book catalogue with live availability, desk issue and return, renewals, a reservation queue and estimated fines |
| **Notes, PYQs and Saved** | `resource_hub_enabled` | The existing Resource Hub, seen through the library. There is no second copy of digital material. |

Students use `/student/library`. The tabs are Books, My loans, Reservations,
PYQs, Notes and Saved. Library staff use **Admin → Library** (`/admin/library`),
which has a Desk tab (issue and return) and a Catalogue tab. Staff need the
`library:manage` permission (ADMIN and LIBRARY roles). Borrowers need
`library:borrow` (students and faculty).

## Circulation rules

The rules live in `src/lib/library.ts`, which is pure and tested. The library
page shows them to students.

| Rule | Default |
|---|---|
| Loan period | 14 days |
| Renewals | 2, each adding 14 days to the current due date. Not allowed when the book is overdue or someone is waiting for it. |
| Active loans per borrower | 5 |
| Active reservations per borrower | 5 |
| Hold for the next in the queue | 3 days |
| Estimated fine | ₹2 per started day late, capped at ₹200. Staff can waive it with a reason, which is audited. **CampusOS takes no payments**: fines are paid at the desk. |

**Availability** is derived, never stored. It is total copies, minus open
loans, minus copies held for a reservation that is ready to collect. Issuing,
returning, reserving and editing copies all lock the book row. So two desks
cannot lend the last copy twice; a concurrency test checks this.

**The queue:**

- A book can be reserved only when no copy is available ("it's on the shelf —
  borrow it at the desk" otherwise).
- When a copy comes back, the first person waiting gets it: the reservation
  becomes READY and they get an important notification.
- The copy can then be lent only to them until the hold expires. After that
  it passes to the next person.
- Expiry is settled whenever the book is touched, in its own transaction, so it
  sticks even if the action that triggered it is refused.
- Cancelling a READY hold passes the copy on in the same way.

**Borrowers** are looked up by email or roll number, and only within the
desk's own college. Every desk action is audited: `LIBRARY_BOOK_ADDED`,
`LIBRARY_BOOK_UPDATED`, `LIBRARY_LOAN_ISSUED`, `LIBRARY_LOAN_RETURNED`,
`LIBRARY_LOAN_RENEWED` and `LIBRARY_FINE_WAIVED`.

## Notes, PYQs and saved resources

- `services/resources#studentResourceVisibility` is now the single visibility
  rule for every student view of the Resource Hub. A student sees published
  material that is institution-wide, from their own department, or shared with
  their section. AI drafts stay hidden.
- **PYQs** are `QUESTION_BANK` resources. **Notes** are `NOTES`, `DOCUMENT` and
  `SLIDES` resources.
- **Save** (`resource_saves`) works on the library tabs and on
  `/student/resources`. It is refused for anything the student cannot see.

## Integration

- **Your Day** puts overdue books first (urgent) and lists books due today or tomorrow.
- **Tools:** the PYQs tool is live and opens `/student/library?tab=pyqs`.
  Quick-create "Save resource" opens the same tab.
- **Privacy:**
  - The data export includes loans (with fines), reservations and saved resources.
  - Account deletion removes saved resources and withdraws open reservations.
  - Loan records stay with the library, because they are an institutional record.

## API

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/library/books?q=` | borrowers | Catalogue with availability and my status |
| `POST /api/library/books` | staff | Add a title |
| `PATCH /api/library/books/:id` | staff | Edit, change copies (never below those out) or withdraw |
| `POST /api/library/books/:id/reserve` | borrowers | Join the queue |
| `DELETE /api/library/reservations/:id` | the reserver | Cancel |
| `POST /api/library/loans` | staff | Issue `{ bookId, borrower }` |
| `POST /api/library/loans/:id/return` | staff | Return, optionally `{ waiveFine, waiveReason }` |
| `POST /api/library/loans/:id/renew` | the borrower | Renew |
| `GET /api/library/me` | borrowers | My loans and reservations |
| `POST`, `DELETE /api/resources/:id/save` | students | Save or unsave a resource |

## Demo data

`scripts/seed-library.ts` adds six invented titles on "Demo shelf" racks. The
demo student has one book due in three days. The only copy of *Organisational
Behaviour Casebook* is out, so it can be reserved.

## Not built yet

- Per-college policy editing (the defaults above apply everywhere).
- Barcode or RFID scanning, and bulk catalogue import.
- Scheduled due-date reminders. Due and overdue books appear in Your Day and on the library page.
- A separate LIBRARY-role portal. Library staff use the admin portal with `library:manage`.
