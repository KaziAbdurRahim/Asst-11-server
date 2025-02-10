require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173','https://rentalcar-2516a.firebaseapp.com', 'https://rentalcar-2516a.web.app' ],
    credentials: true,  
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    console.log('Cookies:', token);
    if (!token) {
        console.log("No Token Found");
        return res.status(401).send({ message: 'Access Denied' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Invalid Token' });
        req.user = decoded;
        console.log("Decoded JWT:", decoded);
        next();
    });
};

//JWT token creation
app.post('/jwt', (req, res) => {
    const user = req.body;
    // console.log('User:', user);
    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
    // console.log(accessToken);

    res.cookie('token', accessToken, {
        httpOnly: true,
        //set true in production 
        // process.env.NODE_ENV === 'production'
        secure: process.env.NODE_ENV === 'production',
        sameSite:  process.env.NODE_ENV === 'production'? 'none':'strict', 
        //change later maybe vv
    }).send({ success: true });
}
);


app.get('/', (req, res) => {
    res.send('Car Server is running');
});

//MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2oi6w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const database = client.db('carhouse');
        const servicesCollection = database.collection('carservices');
        const bookingCollection = database.collection('bookings');

        // get all services
        app.get('/services', async (req, res) => {
            try {
                const result = await servicesCollection.find({}).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
            }
        });

        //get a service by id
        app.get('/services/:id', async (req, res) => {
            id = new ObjectId(req.params.id);
            try {
                const result = await servicesCollection.findOne({ _id: id });
                res.send(result);
            } catch (error) {
                console.error(error);
            }
        });

        //get services posted by user
        app.get('/myservices', verifyToken, async (req, res) => {

            const email = req.query.email;
            if (email !== req.user.email) return res.status(403).send({ message: 'Forbidden Access' });

            try {
                const result = await servicesCollection.find({ email }).toArray();
                res.send(result);
            } catch (error) {
                console.error('Error fetching services:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }

        })

        // get all the orders placed by user
        app.get('/bookedservices', verifyToken, async (req, res) => {
            const email = req.query.email;
            if (email !== req.user.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            try {
                // Fetch all bookings for the logged-in user
                const bookings = await bookingCollection.find({ userEmail: email }).toArray();
                // Add service name and url to each booking
                const enrichedBookings = await Promise.all(
                    bookings.map(async (booking) => {
                        const service = await servicesCollection.findOne(
                            { _id: new ObjectId(booking.serviceId) },
                            { projection: { name: 1, url: 1 } } // Retrieve only the fields we need
                        );
                        return {
                            ...booking,
                            serviceName: service?.name || 'Unknown Service',
                            servicePhotoURL: service?.url || null,
                        };
                    })
                );

                res.send(enrichedBookings);
            } catch (error) {
                console.error('Error fetching booked services:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        // get vendors all the orders (booked services)
        app.get('/servicestodo', verifyToken, async (req, res) => {
            const email = req.query.email;
            if (email !== req.user.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            try {
                // Fetch all bookings for the logged-in user
                const bookings = await bookingCollection.find({ providerEmail: email }).toArray();

                // Add service name and url to each booking
                const enrichedBookings = await Promise.all(
                    bookings.map(async (booking) => {
                        const service = await servicesCollection.findOne(
                            { _id: new ObjectId(booking.serviceId) },
                            { projection: { name: 1, url: 1 } } // Retrieve only the fields we need
                        );
                        return {
                            ...booking,
                            serviceName: service?.name || 'Unknown Service',
                            servicePhotoURL: service?.url || null,
                        };
                    })
                );

                res.send(enrichedBookings);
            } catch (error) {
                console.error('Error fetching booked services:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        // get feature services get max 6
        app.get('/featureservices', async (req, res) => {
            try {
                const result = await servicesCollection.find({}).limit(6).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
            }
        });

        // post a service
        app.post('/services', async (req, res) => {
            try {
                const result = await servicesCollection.insertOne(req.body);
                res.send(result);
            } catch (error) {
                console.error(error);
            }

        });

        //delete service
        app.delete('/services/:id', async (req, res) => {
            id = new ObjectId(req.params.id);
            // console.log('k',id)
            const result = await servicesCollection.deleteOne({ _id: id })
            res.send(result);
        })

        // Update a service by ID
        app.put('/services/:id', async (req, res) => {
            const id = new ObjectId(req.params.id);
            const updatedService = req.body;

            try {
                const result = await servicesCollection.updateOne(
                    { _id: id },
                    { $set: updatedService }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Service not found' });
                }

                res.send({ success: true, message: 'Service updated successfully', result });
            } catch (error) {
                console.error('Error updating service:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        //book a service
        app.post('/book-services', async (req, res) => {
            try {
                const result = await bookingCollection.insertOne(req.body);
                res.send(result)
            } catch (error) {
                console.error(error)
            }
        })

        //update booked service status
        app.patch('/bookedservices/:id', async (req, res) => {
            const { id } = req.params; 
            const { status } = req.body; 

            console.log(status)

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: 'Invalid booking ID.' });
            }

            if (!status || !['pending', 'working', 'completed'].includes(status)) {
                return res.status(400).json({ error: 'Invalid or missing status.' });
            }

            try {
                const result = await bookingCollection.updateOne(
                    { _id: new ObjectId(id) }, 
                    { $set: { status: status } } 
                );

                res.send(result)

            } catch (error) {
                console.error('Error updating status:', error);
                res.status(500).json({ error: 'Internal server error.' });
            }
        });

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// Services

app.get('/sservices', verifyToken, (req, res) => {
    // console.log('cookies', req.cookies);
    const email = req.query.email;
    console.log('Email:', email);
    if (email !== req.user.email) return res.status(403).send({ message: 'Forbidden Access' });

    res.send({ message: 'Services Alright' });
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
