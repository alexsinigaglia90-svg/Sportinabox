# Sportinabox
Sport in a Box


## Accounts & Orders (Cloudflare Pages Functions + D1)

Deze repo bevat nu account-functionaliteit (register/login), address book en order history.

### Vereisten in Cloudflare
1. Maak een D1 database (bijv. `sportinabox_db`) en bind hem aan Pages:
   - Binding name: `DB`
2. Voeg een secret toe:
   - `AUTH_SECRET` = een lange random string

### Schema
Run de SQL in `migrations/001_accounts_orders.sql` op je D1 database.

### Endpoints
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET/PUT `/api/me`
- GET/POST/DELETE `/api/me/addresses`
- GET/POST `/api/orders`

### Front-end
- `/login.html` (sign in / register)
- `/account.html` (orders / profile / addresses)

Checkout in `cart.html` maakt nu een order aan voor ingelogde users.
  
