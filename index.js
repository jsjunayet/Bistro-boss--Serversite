const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.STRIPE);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000
console.log(process.env.STRIPE)

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.l4anbhy.mongodb.net/?retryWrites=true&w=majority`
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const MenuCollection = client.db("bistroDB").collection("MENUS")
    const reviewCollection = client.db("bistroDB").collection("Review")
    const CardCollection = client.db("bistroDB").collection("Cards")
    const userCollection = client.db('bistroDB').collection('users')
    const PaymentCollection = client.db('bistroDB').collection('payments')
    // Send a ping to confirm a successful connection
    // admin home page
    app.get('/alldata',async(req,res)=>{
      const users = await userCollection.estimatedDocumentCount()
      const menu = await MenuCollection.estimatedDocumentCount()
      const order = await PaymentCollection.estimatedDocumentCount()
      const result = await PaymentCollection.aggregate(
      [
        {
          $group:{
            _id:null,
            totalprice:{$sum: '$price'}
          }
        }
      ]).toArray()
    const revene =  result.length > 0? result[0].totalprice: 0

      res.send({users,menu,order,revene})
    })
    app.get('/order',async(req,res)=>{
      const result = await PaymentCollection.aggregate([
      {
        $unwind:'$menuID'
      },
      {
        $lookup: {
          from: "MENUS",
          let: { menuItemId: { $toObjectId: "$menuID" } }, // Convert menuItemIds to ObjectId
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$$menuItemId", "$_id"], // Compare converted menuItemIds with _id in menuCollection
                },
              },
            },
          ],
          as: "menuitems",
        }
        
      },
      {
        $unwind:'$menuitems'
      },
      {
        $group:{
          _id: '$menuitems.category',
          quantity:{ $sum:1 },
          reveune:{ $sum: '$menuitems.price'}
        }
      }
    ]).toArray()
      res.send(result)
    })
    app.get('/menu',async(req,res)=>{
      const result = await MenuCollection.find().toArray()
      res.send(result)
    })
    app.post('/menu',async(req,res)=>{
      const item = req.body;
      const result = await MenuCollection.insertOne(item)
      res.send(result)
    })
    app.patch('/update/:id',async(req,res)=>{
      const item = req.body;
      const id = req.params.id;
      const query = {_id : new ObjectId(id)}
      const updateDoc={
        $set:{
          name:item.name,
          image:item.image,
          category:item.category,
          price:item.price
        }
      }
      const result = await MenuCollection.updateOne(query,updateDoc)
      res.send(result)
    })
    app.delete('/menus/:id',async(req,res)=>{
      const id = req.params.id
      const query = { _id: new ObjectId(id)}
      const result = await MenuCollection.deleteOne(query)
      res.send(result)
    })
    app.get('/menu/:id',async(req,res)=>{
      const id = req.params.id
      const query = { _id : new ObjectId(id)}
      const result = await MenuCollection.findOne(query)
      res.send(result)
    })
    app.get('/review',async(req,res)=>{
      const result = await reviewCollection.find().toArray()
      res.send(result)
    })
    app.post('/card',async(req,res)=>{
      const cardItem = req.body
      const result = await CardCollection.insertOne(cardItem)
      res.send(result)
    })
     app.get('/card',async(req,res)=>{
      const email = req.query.mail
      const query = {email: email}
      const result = await CardCollection.find(query).toArray()
      res.send(result)
    })
    app.delete('/card/:id',async(req,res)=>{
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await CardCollection.deleteOne(query)
      res.send(result)
    })
    // user related api
    app.post('/users',async(req,res)=>{
      const user = req.body
      const query = {email: user.email}
      const isexist = await userCollection.findOne(query)
      if(isexist)
      {
        return res.send({message: 'user already exists', insertedId:null})
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })
    app.get('/selfuser',async(req,res)=>{
      const email = req.query.email
      const query = {email:email}
      const result = await userCollection.findOne(query)
      res.send(result)
    })
    const verifyToken = (req,res,next)=>{
      
      if(!req.headers.authorization)
      {
        return res.status(403).send({message : 'unauthorization'})
      }
      const token = req.headers.authorization.split(' ')[1];
      
      
      jwt.verify(token, process.env.ACCES_TOKEN, function(err, decoded) {
        if(err)
        {
          return res.status(403).send({message : 'unauthorization'})
        }
        req.decoded = decoded
        next()
      });
     
    }
    const verifyAdmin = async(req,res,next)=>{
      const email = req.decoded.email;
      const query = {email:email}
      const users = await userCollection.findOne(query)
      const isAdmin = users?.role =="admin";
      if(!isAdmin)
      {
        return res.status(403).send({message:"forbiden email"})
      }
      next()
    }
    // payment method
    app.post("/create-payment-intent",async(req,res)=>{
      const {price} = req.body
      const amount = parseInt(price*100)
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount:amount,
        currency: "usd",
        payment_method_types: ["card"]
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })
    app.post('/payment',async(req,res)=>{
      const payments = req.body
      const result = await PaymentCollection.insertOne(payments)
      // caryfully delete it item form the card;
      const query = {_id: {$in: payments.cardId.map(id=> new ObjectId(id))}
      }
      const deletedResult = await CardCollection.deleteMany(query)
      console.log('payment',payments)
      res.send({result,deletedResult})
    })
    app.get('/payment/:email',verifyToken,async(req,res)=>{
      const email = req.params.email;
      if(!req.query.email==req.decoded.email)
      {
        return res.status(403).send({message:"forbiden email"})
      }
      const query = {email:email}
      const result = await PaymentCollection.find(query).toArray()
      res.send(result)
    })
    app.get('/users',verifyToken,verifyAdmin, async(req,res)=>{
      const result = await userCollection.find().toArray()
      res.send(result)
    })
    app.delete('/users/:id',async(req,res)=>{
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })
    app.patch('/users/admin/:id',async(req,res)=>{
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const updatedDoc = {
        $set :
        {
          role : 'admin'
        }
      }
      const result = await userCollection.updateOne(query,updatedDoc)
      res.send(result)
    })
    app.get('/users/admin/:email',async(req,res)=>{
      const email = req.params.email;
      const query = {email: email}
      const user = await userCollection.findOne(query)
      let admin = false
      if(user)
      {
        admin = user?.role === 'admin';
      }
      res.send({admin})
    })
    app.post('/jwt',async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCES_TOKEN,
        { expiresIn: '1h' })
        res.send(token)
    })
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
