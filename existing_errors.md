1-)(solved) phase 4 4.12 --> Updating profile is unsuccessful with error of 

users.ts:25 
 PATCH http://localhost:4000/api/users/me 404 (Not Found)
Promise.then		
(anonymous)	@	users.ts:25
(anonymous)	@	ProfilePage.tsx:41

solved by adding patch /me to userRoutes.ts

2) generating order numbers randomly is not suitable for production env in orderService.ts, connect with a backend.

3) after wholesaler approved the order, stock must change accordingly.