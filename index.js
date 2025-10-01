const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");

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
      const { category } = req.query;
      let query = {};
      if (category && category.toLowerCase() !== "all") {
        query = { category: category.toLowerCase() };
      }
      const result = await productsCollection.find(query).toArray();
      res.send(result);
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
