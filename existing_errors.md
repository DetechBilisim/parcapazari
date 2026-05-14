1-)(solved) phase 4 4.12 --> Updating profile is unsuccessful with error of 

users.ts:25 
 PATCH http://localhost:4000/api/users/me 404 (Not Found)
Promise.then		
(anonymous)	@	users.ts:25
(anonymous)	@	ProfilePage.tsx:41

solved by adding patch /me to userRoutes.ts

