const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");

const port = process.env.PORT || 5000;

// MiddleWere
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1wx8p.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
// client.connect((err) => {
//   const collection = client.db("test").collection("devices");
//   // perform actions on the collection object
//   console.log("DV CON");
//   client.close();
// });

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
        console.log(exists);
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
      const services = await servicesCollection.find({}).toArray();
      res.send(services);
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