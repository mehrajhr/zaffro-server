# 🛍️ Zaffro (Server Side)

Zaffro is a modern, full-featured e-commerce web application tailored for fashion and clothing retail. It delivers an intuitive shopping experience for users while providing comprehensive management capabilities for store administrators.


This is the backend server and REST API for **Zaffro**, a modern e-commerce clothing platform. It handles secure data persistence, user authentication verification via JSON Web Tokens (JWT), real-time inventory and stock control, order processing, and administrative data management.
---

## Live Demo & Links
* **Live Website:** https://zaffro.netlify.app/
* **Server Repository:** https://github.com/mehrajhr/zaffro-client

---

## Key Features

* **RESTful API Endpoints:** Structured endpoints for product catalogs, user management, orders, and inventory.
* **JWT Authentication Security:** Secure token verification middleware to protect private routes and administrative mutations.
* **Real-time Stock Control:** Automated backend inventory updates upon successful order placement to prevent overselling.
* **Order & Invoice Management:** Endpoints for tracking order status lifecycles and compiling transaction details.
* **CORS & Environment Protection:** Configured production-ready CORS policies and secure environment variable handling.

---

## Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database :** MongoDB
* **Authentication Security:** JSON Web Tokens (JWT)
* **Utilities:** Dotenv, CORS, Cookie-Parser

---

## Environment Variables Setup

Create a .env file in the root directory of your client project and add your Firebase configuration keys:

PORT=5000
MONGODB_URI=your_mongodb_connection_string
ACCESS_TOKEN_SECRET=your_jwt_secret_key

## Installation & Running Locally

git clone https://github.com/mehrajhr/zaffro-server.git

## Navigate to the project directory:

cd zaffro-server

## Install dependencies:

npm install

## Run the development server:

npm start
