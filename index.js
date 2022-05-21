const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(
  "sk_test_51L105BIxM8sRxo2m2ImDa0Dfed0uNX24xpabivNaB9S2g0gBEqod8R4YCQCTQIPDhQkfUHsTEbckhA3lB7A0jW60006zgu39kC"
);

// MiddleWere
app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized" });
  }

  const accessToken = authHeader.split(" ")[1];

  jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

const { MongoClient, ServerApiVersion } = require("mongodb");
const query = require("express/lib/middleware/query");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1wx8p.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    // Getting connected with DB
    await client.connect();

    // All booked appointments collection
    const bookedAppointmentsCollection = client
      .db("doctors-portal-1")
      .collection("bookedAppointments");

    // All booked appointments collection
    const servicesCollection = client
      .db("doctors-portal-1")
      .collection("services");

    // All users collection
    const usersCollection = client.db("doctors-portal-1").collection("users");

    // Doctors collection
    const doctorsCollection = client
      .db("doctors-portal-1")
      .collection("doctors");

    // verifyAdmin
    async function verifyAdmin(req, res, next) {
      const requesterEmail = req?.decoded?.email;

      const user = await usersCollection.findOne({ email: requesterEmail });

      if (user?.role === "admin") {
        next();
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    }

    // Create payment intent (send client secret to fondend)
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const payableAmount = price * 100;

      const paymentIntents = await stripe.paymentIntents.create({
        amount: payableAmount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntents.client_secret });
    });

    // Posting booked appointment
    app.post("/bookAppointment", async (req, res) => {
      const bookedAppointment = req.body;

      // Checking if the treatment is already booked

      const patientEmail = bookedAppointment.email;
      const bookedDate = bookedAppointment.date;
      const treatmentName = bookedAppointment.treatmentName;

      const exists = await bookedAppointmentsCollection.findOne({
        email: patientEmail,
        date: bookedDate,
        treatmentName,
      });

      if (exists) {
        res.status(403).send({ message: "already booked" });
        return;
      } else {
        const result = await bookedAppointmentsCollection.insertOne(
          bookedAppointment
        );
        res.send(result);
      }
    });

    // Get all services
    app.get("/services", async (req, res) => {
      const services = await servicesCollection
        .find({})
        .project({ treatmentName: 1 })
        .toArray();
      res.send(services);
    });

    // Add Doctor
    app.post("/addDoctor", verifyJWT, async (req, res) => {
      const docInfo = req.body;
      const result = await doctorsCollection.insertOne(docInfo);
      res.send(result);
    });

    // Get available services
    app.get("/availableServices", async (req, res) => {
      const date = req?.query?.date;

      // Step-1 Get all services
      const allServices = await servicesCollection.find({}).toArray();

      // Step-2 Get that days bookings
      const bookedAppointsOnThatDay = await bookedAppointmentsCollection
        .find({ date })
        .toArray();

      // Get bookings for each service
      allServices.forEach((service) => {
        // Get all bookings for this service
        const bookingsForThisService = bookedAppointsOnThatDay.filter(
          (b) => b.treatmentName === service.treatmentName
        );

        // Get booked slots for this service
        const bookedSlotsForThisService = bookingsForThisService.map(
          (s) => s.slot
        );

        // Get available slots for this service
        const availableSlotsForThisService = service.slots.filter(
          (slot) => !bookedSlotsForThisService.includes(slot)
        );

        service.slots = availableSlotsForThisService;
      });

      res.send(allServices);
    });

    // GET token and setUser also set the role for doctors
    app.put("/token", async (req, res) => {
      const { currentUser } = req.body;

      const email = currentUser?.email;

      const filter = { email };

      const options = { upsert: true };

      const updateDoc = {
        $set: currentUser,
      };

      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );

      // checking if this user is a doctor
      const isDoctor = await doctorsCollection.findOne(filter);

      if (isDoctor) {
        const docRoleAdded = {
          $set: {
            role: "doctor",
          },
        };

        const docRoleResult = await usersCollection.updateOne(
          filter,
          docRoleAdded
        );
      }

      const accessToken = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET);

      res.send([result, accessToken]);
    });

    // Get booked appointments by email
    app.get("/appointments/:email", verifyJWT, async (req, res) => {
      const email = req?.params?.email;

      const requesterEmail = req.decoded;

      const appointments = await bookedAppointmentsCollection
        .find({ email })
        .toArray();
      res.send(appointments);
    });

    app.get("/users", verifyJWT, async (req, res) => {
      const users = await usersCollection.find({}).toArray();

      res.send(users);
    });

    // Make admin API
    app.put("/makeAdmin", verifyJWT, verifyAdmin, async (req, res) => {
      // Requester Email
      const { email } = req.body;

      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne({ email }, updateDoc);
      res.send(result);
    });

    // ADMIN CHECKER
    app.post("/isAdmin", async (req, res) => {
      const { currentUserEmail } = req.body;

      const user = await usersCollection.findOne({ email: currentUserEmail });

      const role = user?.role;

      res.send({ role: role });
    });

    // GEt a appointment by id
    app.get("/appointmentById/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const appointment = await bookedAppointmentsCollection.findOne(query);
      res.send(appointment);
    });

    // save payment info
    app.patch("/payment", verifyJWT, async (req, res) => {
      const { transactionId, appointmentId } = req.body;

      const filter = { _id: ObjectId(appointmentId) };
      const updateDoc = {
        $set: {
          paid: "true",
          transactionId: transactionId,
        },
      };
      const result = await bookedAppointmentsCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(result);
    });

    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorsCollection.find({}).toArray();
      res.send(doctors);
    });

    // Delete DOCTOR
    app.delete(
      "/deleteDoctor/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await doctorsCollection.deleteOne(filter);
        res.send(result);
      }
    );

    // Load Doc by specialty
    app.get("/doctor/:specialty", async (req, res) => {
      const specialty = req.params.specialty;
      const result = await doctorsCollection.findOne({ specialty: specialty });
      if (result) {
        res.send(result);
      }
    });

    // Checking DOCTOR
    app.post("/isDoctor", async (req, res) => {
      const { currentUserEmail } = req.body;

      const user = await usersCollection.findOne({ email: currentUserEmail });

      const role = user?.role;

      res.send({ role: role });
    });
  } finally {
    // await client.close()
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("From DOC-1 backend");
});

app.listen(port, () => {
  console.log("Responding to", port);
});
