1-)(solved) phase 4 4.12 --> Updating profile is unsuccessful with error of 

users.ts:25 
 PATCH http://localhost:4000/api/users/me 404 (Not Found)
Promise.then		
(anonymous)	@	users.ts:25
(anonymous)	@	ProfilePage.tsx:41

solved by adding patch /me to userRoutes.ts

2-)(solved) generating order numbers randomly is not suitable for production env in orderService.ts, connect with a backend.

solved by replacing the random `Date.now()` + `Math.random()` approach with a PostgreSQL sequence (`pp_order_seq`). `generateOrderNumber()` is now async and calls `CREATE SEQUENCE IF NOT EXISTS` then `nextval()` so order numbers are guaranteed unique and sequential (format: `PP-YYYY-NNNNNN`).

3-)(solved) after wholesaler approved the order, stock must change accordingly.

solved by updating `updateOrderStatus` in `orderService.ts`: when the new status is `CONFIRMED`, a Prisma transaction fetches the order's items and calls `partListing.update({ stock: { decrement: item.quantity } })` for each one before updating the order status, so stock is atomically decremented on approval.

4-)(solved) Sadece Stoktakiler toggle is not working, even other products has no stocks, still appear when this toggle is selected.

solved in two places: (1) `resolvers.ts` — the `parts` query now adds `where.listings = { some: { isActive: true, stock: { gt: 0 } } }` when `inStockOnly` is true, so parts with no in-stock listings are excluded at the database level. (2) `queries.ts` and `RetailerSearchPage.tsx` — the `listings(inStockOnly: ...)` field arg is now passed dynamically as a `$inStockOnly` variable instead of being hardcoded to `true`, so when the toggle is off, out-of-stock listings are shown too.

5-) when wholesaler or retailer try to download image, gives error : {"error":"Missing or invalid authorization header"}
