# CodeAlpha_EcommerceStore

A full-stack e-commerce web application built as **Task 1** of the [CodeAlpha](https://www.codealpha.tech) Full Stack Development Internship. Users can browse products, view details, manage a shopping cart, register and log in, and place orders.

## Features

- **Product listings** with search and category filtering
- **Product details page** with images, description, price, and stock
- **Shopping cart**: add, remove, and update quantities
- **Order processing**: checkout creates an order and stores its items
- **User registration and login** with hashed passwords and JWT-based sessions
- **Order history** for logged-in users
- **Persistent storage** of products, users, and orders in a database

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | HTML, CSS, JavaScript                   |
| Backend   | Node.js, Express.js                     |
| Database  | MySQL                                    |
| Auth      | bcrypt (password hashing), JSON Web Tokens |

The storefront is served by Express. It shows a local sample catalog when MySQL is not configured; accounts and order processing require a database.

## Project Structure

```
CodeAlpha_EcommerceStore/
├── client/
│   ├── index.html          # Responsive storefront
│   ├── css/styles.css
│   └── js/app.js            # Catalog, cart, account, and checkout flows
├── server.js                # Express API and static file server
├── server/db/
│   ├── schema.sql           # Table definitions
│   └── seed.sql             # Sample products
├── .env.example
├── package.json
└── README.md
```

## Database Schema

- **users**: `id`, `name`, `email` (unique), `password_hash`, `created_at`
- **products**: `id`, `name`, `description`, `price`, `image_url`, `category`, `stock`
- **orders**: `id`, `user_id`, `total`, `status`, `created_at`
- **order_items**: `id`, `order_id`, `product_id`, `quantity`, `unit_price`

## API Endpoints

### Auth
| Method | Endpoint             | Description          |
|--------|----------------------|----------------------|
| POST   | `/api/auth/register` | Create a new account |
| POST   | `/api/auth/login`    | Log in, returns JWT  |

### Products
| Method | Endpoint             | Description                        |
|--------|----------------------|------------------------------------|
| GET    | `/api/products`      | List products (search/filter params) |
| GET    | `/api/products/:id`  | Get one product                    |

### Orders (requires auth)
| Method | Endpoint             | Description                 |
|--------|----------------------|-----------------------------|
| POST   | `/api/orders`        | Place an order from the cart |
| GET    | `/api/orders`        | Get the user's order history |
| GET    | `/api/orders/:id`    | Get one order's details      |

The cart is kept client-side (localStorage) and sent to the server at checkout.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [MySQL](https://dev.mysql.com/downloads/mysql/) v8.0.16 or later

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/<your-username>/CodeAlpha_EcommerceStore.git
   cd CodeAlpha_EcommerceStore
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create and seed the database**
   ```bash
   mysql -u root -p -e "CREATE DATABASE ecommerce_store CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
   mysql -u root -p ecommerce_store < server/db/schema.sql
   mysql -u root -p ecommerce_store < server/db/seed.sql
   ```

4. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in your database URL and a random JWT secret (at least 32 characters):
   ```env
   PORT=5000
   DATABASE_URL=mysql://user:password@localhost:3306/ecommerce_store
   JWT_SECRET=replace_with_a_long_random_string
   MYSQL_SSL=false
   ```

   Set `MYSQL_SSL=true` when your hosted MySQL provider requires TLS. The storefront can also be previewed without MySQL, but registration, login, and orders require the database. `/api/health` reports the current database status.

5. **Start the server**
   ```bash
   npm start
   ```
   The app runs at `http://localhost:5000`.

## Usage

1. Register an account and log in.
2. Browse products and open a product to see its details.
3. Add items to your cart and adjust quantities.
4. Check out to place an order.
5. View past orders from your account.

## Security Notes

- Passwords are hashed with bcrypt and never stored in plain text.
- Protected routes verify a JWT on every request.
- Database queries use parameterized statements to prevent SQL injection.
- Secrets live in `.env`, which is excluded from version control.

## Future Improvements

- Payment gateway integration
- Admin dashboard for managing products and orders
- Product reviews and ratings
- Email confirmation for orders

## Author

**Storm**
[GitHub](https://github.com/<your-username>) · [LinkedIn](https://linkedin.com/in/<your-profile>)

## Acknowledgements

Built as part of the Full Stack Development internship at [CodeAlpha](https://www.codealpha.tech).
