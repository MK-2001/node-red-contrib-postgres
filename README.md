Node-red Postgres Suite
========================


Install
-------

Run the following command in the root directory of your Node-RED install

    npm install node-red-contrib-postgres


Overview
-------

This add-on, includes a suite of nodes to work with Postgres :

- PG Connection
- PG Insert
- PG Update
- PG Select

The first node accepts a string that represents the query to be executed.

The last 3 nodes accept an Object and outputs a Postgres query that can be used with the PG Connection node.

## PG Connection

The PG Connection node accepts as a parameters an ​*postgresdb*​ config node, the parameter ​*Receive query output ?*​ needs to be used in the case the query produces results (like a Select).

## PG Insert

The parameters for the Insert node are the name of table in which data is inserted.

The ​*msg.payload*​ is the data that will be inserted, this data is filtered using the ​*Accepted columns*​ param, in the case the param is empty - are used all the columns available on ​*msg.payload*​.
Enabling the ​*All columns required ?*​ parameter, if in the ​*msg.payload*​ aren't available all the columns accepted by the node, the query is rejected (This param is ignored in the case the param ​*Accepted columns*​ is empty).

## PG Update

Like the PG Insert, this node has the parameters table name and accepted column.  These are the columns where the data will be updated. The parameter ​*Where Columns*​ works exactly like the parameter ​*Accepted Columns*​, the values for the where needs to be specified on the ​*msg.where*​

### Example Input

```json
{
   "payload" : {
       "foo" : 1,
       "bar" : "xD",
       "test": 2
   },
   "where" : {
       "foo" : 4
   }
}
```

## PG Select

Like the ​*PG Update*​ node, this node accept the parameter ​*Where Columns*​, in that case the where clause is specified in the ​*msg.payload*​, in the case the ​*Ignore the where clause ?*​ parameter is enabled, the ​*msg.payload*​ and every time the node is triggered the input isn't checked.

The ​*columns*​ parameter are the columns that you want to select from the table, in the case a ​*msg.group*​ is passed to the node, the ​*Group by*​ parameter is overwritten, same thing for ​*msg.order*​

For each of the ​*limit*​, ​*offset*​ parameters, in the case the value set is different from 0, the ​*msg.limit*​ / ​*msg.offset*​ is ignored
