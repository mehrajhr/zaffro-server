const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.e7tn1md.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    await client.connect();

    const db = client.db("zaffro-db");
    const productsCollection = db.collection("products");

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
    app.get("/orders", async (req, res) => {
      try {
        const orders = await db
          .collection("orders")
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
      const session = db.client.startSession();

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
            const product = await db
              .collection("products")
              .findOne({ _id: new ObjectId(item.productId) });

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
            await db
              .collection("products")
              .updateOne(
                { _id: new ObjectId(item.productId) },
                { $set: { sizes: product.sizes } },
                { session }
              );
          }

          // Insert order
          const result = await db
            .collection("orders")
            .insertOne(order, { session });
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
    app.patch("/orders/:orderId", async (req, res) => {
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

    // GET order information using admin only
    app.get("/orders/:orderId", async (req, res) => {
      try {
        const { orderId } = req.params;
        const order = await db
          .collection("orders")
          .findOne({ _id: new ObjectId(orderId) });

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
    app.delete("/products/:id", async (req, res) => {
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
    app.patch("/api/orders/:orderId", async (req, res) => {
      try {
        const { orderId } = req.params;
        const { orderStatus } = req.body;

        if (!orderStatus) {
          return res.status(400).json({ message: "orderStatus is required" });
        }

        const result = await db
          .collection("orders")
          .updateOne({ _id: new ObjectId(orderId) }, { $set: { orderStatus } });

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
    app.post("/products", async (req, res) => {
      try {
        const newProduct = req.body;
        const result = await productsCollection.insertOne(newProduct);
        res.send({ insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.put("/products/:id", async (req, res) => {
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
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Zaffro server running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
