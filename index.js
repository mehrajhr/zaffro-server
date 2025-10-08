const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64");
const serviceAccount = JSON.parse(decoded.toString("utf8"));

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.0ql3nmb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("zaffro-db");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");
    const usersCollection = db.collection("users");

    const verifyFBToken = async (req, res, next) => {
      // console.log('from middleware ', req.headers.authorization);
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // verify the token

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    const verifyAdmin = async (req, res, next) => {
      try {
        if (!req.decoded?.email)
          return res.status(401).send({ message: "unauthorized access" });
        const email = req.decoded.email;
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== "admin") {
          return res.status(403).send({ message: "forbidden access" });
        }
        next();
      } catch (err) {
        console.error("verifyAdmin error:", err);
        res.status(500).send({ message: "Server error" });
      }
    };

    const verifyEmail = async (req, res, next) => {
      if (req.decoded.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const email = user.email;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          await usersCollection.updateOne(
            { email },
            { $set: { last_login: new Date().toISOString() } }
          );
          return res
            .status(200)
            .json({ message: "User already exists", updated: true });
        }

        const result = await usersCollection.insertOne(user);
        return res
          .status(201)
          .json({ message: "New user created", insertedId: result.insertedId });
      } catch (error) {
        console.error("Error saving user:", error);
        return res.status(500).json({ message: "Server error" });
      }
    });
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res, next) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/role/users", verifyFBToken , verifyEmail, async (req, res , next) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.send({ role: user.role });
    });
    app.patch("/users/:id/role", verifyFBToken, verifyAdmin, async (req, res , next) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        // ✅ Validate role
        if (!["admin", "customer"].includes(role)) {
          return res.status(400).json({ message: "Invalid role value" });
        }

        // ✅ Update user role
        const result = await db
          .collection("users")
          .updateOne({ _id: new ObjectId(id) }, { $set: { role: role } });

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ message: "User not found or role unchanged" });
        }

        res.json({
          success: true,
          message: `User role updated to ${role}`,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating role:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // for products
    app.get("/products", async (req, res) => {
      try {
        const { search = "", category = "all" } = req.query;

        const query = {};

        if (search) {
          query.name = { $regex: search, $options: "i" }; // case-insensitive search
        }

        if (category !== "all") {
          query.category = category;
        }

        const products = await productsCollection.find(query).toArray();
        res.send(products);
      } catch (error) {
        console.error("❌ Error fetching products:", error);
        res.status(500).send({ message: "Error fetching products" });
      }
    });

    // GET New Arrivals
    app.get("/products/new-arrivals", async (req, res) => {
      try {
        const { category } = req.query;

        // Build the query object
        const query = { isNewArrival: true };
        if (category && category !== "all") {
          query.category = category;
        }

        const newArrivals = await productsCollection.find(query).toArray();
        res.status(200).json(newArrivals);
      } catch (error) {
        console.error("Failed to fetch new arrivals:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get all discounted products (Sale / Offers)
    app.get("/products/discounts", async (req, res) => {
      try {
        const { category } = req.query;

        const filter = { discountPrice: { $ne: null } }; // Only products with discount

        if (category && category !== "all") {
          filter.category = category;
        }

        const discountedProducts = await productsCollection
          .find(filter)
          .toArray();
        res.status(200).json(discountedProducts);
      } catch (error) {
        console.error("Failed to fetch discounted products:", error);
        res.status(500).json({ message: "Server error" });
      }
    });
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;

      // ✅ Validate before using ObjectId
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }

      try {
        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });
        res.json(product);
      } catch (error) {
        console.error("❌ Error fetching product details:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // for admin only

    // for orders manage by admin

    // GET /orders using admin only
    app.get("/orders", verifyFBToken , verifyAdmin, async (req, res , next) => {
      try {
        const orders = await ordersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(orders);
      } catch (err) {
        console.error("Failed to fetch orders:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // reminder : its using by user
    app.post("/orders", async (req, res) => {
      const session = client.startSession();

      try {
        const order = req.body;

        // ✅ Basic validation
        if (!order.customer?.name || !order.items?.length) {
          return res.status(400).json({ message: "Missing order details" });
        }

        order.createdAt = new Date();
        order.status = "pending";

        // ⚙️ Start a transaction to keep data consistent
        await session.withTransaction(async () => {
          // Loop through each ordered item
          for (const item of order.items) {
            const product = await productsCollection.findOne({
              _id: new ObjectId(item.productId),
            });

            if (!product) {
              throw new Error(`Product not found: ${item.productId}`);
            }

            // Find the size entry in product.sizes[]
            const sizeIndex = product.sizes.findIndex(
              (s) => s.size === item.size
            );
            if (sizeIndex === -1) {
              throw new Error(
                `Size ${item.size} not found for ${product.name}`
              );
            }

            const availableStock = product.sizes[sizeIndex].stock;

            // Check stock availability
            if (availableStock < item.quantity) {
              throw new Error(
                `Insufficient stock for ${product.name} (${item.size})`
              );
            }

            // Deduct stock
            product.sizes[sizeIndex].stock -= item.quantity;

            // Update the product in DB
            await productsCollection.updateOne(
              { _id: new ObjectId(item.productId) },
              { $set: { sizes: product.sizes } },
              { session }
            );
          }

          // Insert order
          const result = await ordersCollection.insertOne(order, { session });
          res.status(201).json({ success: true, orderId: result.insertedId });
        });
      } catch (err) {
        console.error("Order creation failed:", err);
        res
          .status(500)
          .json({ message: err.message || "Internal server error" });
      } finally {
        await session.endSession();
      }
    });

    // PATCH / order status change
    app.patch("/orders/:orderId", verifyFBToken, verifyAdmin , async (req, res , next) => {
      const session = db.client.startSession();

      try {
        const { orderId } = req.params;
        const { status: newStatus } = req.body;

        if (!newStatus) {
          return res.status(400).json({ message: "orderStatus is required" });
        }

        await session.withTransaction(async () => {
          // Fetch the order
          const order = await db
            .collection("orders")
            .findOne({ _id: new ObjectId(orderId) }, { session });

          if (!order) {
            throw new Error("Order not found");
          }

          // If status is changing to "Cancelled" AND previous status was not cancelled
          if (newStatus === "cancelled" && order.status !== "cancelled") {
            for (const item of order.items) {
              const product = await db
                .collection("products")
                .findOne({ _id: new ObjectId(item.productId) }, { session });

              if (!product) continue;

              const sizeIndex = product.sizes.findIndex(
                (s) => s.size === item.size
              );
              if (sizeIndex !== -1) {
                product.sizes[sizeIndex].stock += item.quantity;
                await db
                  .collection("products")
                  .updateOne(
                    { _id: product._id },
                    { $set: { sizes: product.sizes } },
                    { session }
                  );
              }
            }
          }

          // Update order status
          const result = await db
            .collection("orders")
            .updateOne(
              { _id: new ObjectId(orderId) },
              { $set: { status: newStatus } },
              { session }
            );

          if (result.modifiedCount === 0) {
            throw new Error("Order status unchanged");
          }
        });

        res
          .status(200)
          .json({ success: true, message: "Order status updated" });
      } catch (err) {
        console.error("Failed to update order status:", err);
        res
          .status(500)
          .json({ message: err.message || "Internal server error" });
      } finally {
        await session.endSession();
      }
    });

    app.delete("/orders/:id", verifyFBToken , verifyAdmin , async (req, res , next) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    // GET order information using admin only
    app.get("/orders/:orderId", verifyFBToken, verifyAdmin, async (req, res , next) => {
      try {
        const { orderId } = req.params;
        const order = await ordersCollection.findOne({
          _id: new ObjectId(orderId),
        });

        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        res.status(200).json(order);
      } catch (err) {
        console.error("Failed to fetch order details:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // for product manage by admin
    app.delete("/products/:id", verifyFBToken , verifyAdmin, async (req, res , next) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid product ID" });
        }

        const result = await productsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send({ message: "Product deleted successfully" });
      } catch (error) {
        console.error("❌ Error deleting product:", error);
        res.status(500).send({ message: "Error deleting product" });
      }
    });

    // PATCH /orders/:orderId order details
    app.patch("/api/orders/:orderId", verifyFBToken, verifyAdmin , async (req, res , next) => {
      try {
        const { orderId } = req.params;
        const { orderStatus } = req.body;

        if (!orderStatus) {
          return res.status(400).json({ message: "orderStatus is required" });
        }

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { orderStatus } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ message: "Order not found or status unchanged" });
        }

        res
          .status(200)
          .json({ success: true, message: "Order status updated" });
      } catch (err) {
        console.error("Failed to update order status:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Add a new product
    app.post("/products", verifyFBToken, verifyAdmin,  async (req, res , next) => {
      try {
        const newProduct = req.body;
        const result = await productsCollection.insertOne(newProduct);
        res.send({ insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.put("/products/:id", verifyFBToken , verifyAdmin,  async (req, res , next) => {
      const id = req.params.id;
      try {
        const updateData = req.body;
        const result = await productsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        res.json(result); // result.modifiedCount will be 1 if updated
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run();

app.get("/", async (req, res) => {
  res.send("Zaffro server running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
