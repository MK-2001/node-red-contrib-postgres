/**
 * Copyright 2013 Kris Daniels.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/



 module.exports = function(RED) {
    "use strict";
    var pg=require('pg');
    var pgBuilder = require('knex')({client: 'pg'});
    var named=require('node-postgres-named');
    var querystring = require('querystring');

    RED.httpAdmin.get('/postgresdb/:id',function(req,res) {
        var credentials = RED.nodes.getCredentials(req.params.id);
        if (credentials) {
            res.send(JSON.stringify({user:credentials.user,hasPassword:(credentials.password&&credentials.password!="")}));
        } else {
            res.send(JSON.stringify({}));
        }
    });

    RED.httpAdmin.delete('/postgresdb/:id',function(req,res) {
        RED.nodes.deleteCredentials(req.params.id);
        res.send(200);
    });

    RED.httpAdmin.post('/postgresdb/:id',function(req,res) {
        var body = "";
        req.on('data', function(chunk) {
            body+=chunk;
        });
        req.on('end', function(){
            var newCreds = querystring.parse(body);
            var credentials = RED.nodes.getCredentials(req.params.id)||{};
            if (newCreds.user == null || newCreds.user == "") {
                delete credentials.user;
            } else {
                credentials.user = newCreds.user;
            }
            if (newCreds.password == "") {
                delete credentials.password;
            } else {
                credentials.password = newCreds.password||credentials.password;
            }
            RED.nodes.addCredentials(req.params.id,credentials);
            res.send(200);
        });
    });


    function PostgresDatabaseNode(n) {
        RED.nodes.createNode(this,n);
        this.hostname = n.hostname;
        this.port = n.port;
        this.db = n.db;
        this.ssl = n.ssl;
        this.connectionString = n.connectionstring;

    	var credentials = this.credentials;
    	if (credentials) {
    		this.user = credentials.user;
    		this.password = credentials.password;
    	}
    }

    function PostgresArrayNode(n) {
        RED.nodes.createNode(this,n);

        try {
            this.columns = JSON.parse(n.columns);
        } catch (e) {
            node.error(e.message);
            this.columns = [];
        }
    }


    RED.nodes.registerType("postgresdb",PostgresDatabaseNode,{
            credentials: {
                user: {type:"text"},
                password: {type: "password"}
            }
        });
    RED.nodes.registerType("postgresarray",PostgresArrayNode);

    function PostgresNode(n) {
    	RED.nodes.createNode(this,n);

        this.topic = n.topic;
        this.postgresdb = n.postgresdb;
        this.postgresConfig = RED.nodes.getNode(this.postgresdb);
        this.sqlquery = n.sqlquery;
        this.output = n.output;

        var node = this;

        if(this.postgresConfig) {

    		node.on('input', function(msg){
                
                var connectionString;

                if (!node.postgresConfig.connectionString || node.postgresConfig.connectionString === "")
                {
                    connectionString = "postgres://" 
                        + node.postgresConfig.user + ":" 
                        + node.postgresConfig.password + "@"
                        + node.postgresConfig.hostname + "/"
                        + node.postgresConfig.db;
                } else {
                    connectionString = node.postgresConfig.connectionString;
                }

                var client = new pg.Client(connectionString);
                client.connect( function(err, client, done) {
                    if(err) {
                        err.connectionString = conString;
                        err.queryParameters = msg.queryParameters;
                        console.log(err);
                        node.error(err);
                    } else {
                        named.patch(client);
        				if(!msg.queryParameters) msg.queryParameters={};
        				client.query(
                            msg.payload,
        					msg.queryParameters,
        					function (err, results) {
                                done();
        					    if(err) {
                                    node.error(err);
                                }
        						else {
        						   if(node.output) {
        								msg.payload = results.rows;
        								node.send(msg);
        							}
        					    }
        					}
                        );
                    }
                });
    		});
    	} else {
            this.error("missing postgres configuration");
        }

        this.on("close", function() {
            if(node.clientdb) node.clientdb.end();
        });
    }

    function _prepareColumns(payload,columns) {
        var allColumns = columns.length === 0;
        if ((typeof payload !== "object") || (payload === null) || (Array.isArray(payload))) {
            throw new Error("Invalid payload type");
        }
        var cols = {},
            ok = true;
        for (var key in payload) {
            if (payload.propertyIsEnumerable(key)) {
                if ( allColumns || ( columns.indexOf(key.toLowerCase()) !== -1)) {
                    if (typeof payload[key] !== "object") {
                        cols[key.toLowerCase()] = payload[key];
                    } else {
                        throw new Error("Invalid property type "+typeof payload[key]+"\n"+JSON.stringify(payload[key],null,4));
                        ok = false;
                        break;
                    }
                }
            }
        }
        if (ok) {
            return cols;
        }
    }

    function PostgresNodeInsert(n) {
        var node = this;

        RED.nodes.createNode(this,n);

        this.allColumns = n.columns.length === 0;
        this.columns = RED.nodes.getNode(n.columns).columns;
        this.requireAll = n.requireAll;
        this.table = n.table;

        node.on("input",function (msg) {
            try {
                var cols = _prepareColumns(msg.payload,node.columns);
                if ( !node.requireAll || (node.columns.length === Object.keys(cols).length ) ) {
                    //Build query
                    var query = pgBuilder(node.table).insert(cols).toString();
                    node.send({
                        payload : query
                    });
                } else {
                    node.error("One or more columns are missing");
                }
            } catch (e) {
                node.error(e.message);
            }
        });
    }


    function PostgresNodeUpdate(n) {
        var node = this;

        RED.nodes.createNode(this,n);

        this.allColumns = n.columns.length === 0;
        this.columns = RED.nodes.getNode(n.columns).columns;
        this.where = RED.nodes.getNode(n.where).columns;
        this.requireAll = n.requireAll;
        this.requireAllWhere = n.requireAllWhere;
        this.table = n.table;

        node.on("input",function (msg) {
            try {
                var cols = _prepareColumns(msg.payload,node.columns),
                    where= {};
                if (msg.where) {
                    where = _prepareColumns(msg.where,node.where);
                }
                if ( !node.requireAll || (node.columns.length === Object.keys(cols).length ) ) {
                    //Build query
                    var query = pgBuilder(node.table).update(cols);
                    if ( !node.requireAllWhere || (node.where.length === Object.keys(where).length ) ) {
                        if (Object.keys(where).length) {
                            query = query.where(where);
                        }
                        node.send({
                            payload : query.toString()
                        });
                    }
                } else {
                    node.error("One or more columns are missing");
                }
            } catch (e) {
                node.error(e.message);
            }
        });
    }

    function PostgresNodeSelect(n) {
        var node = this;

        RED.nodes.createNode(this,n);

        this.allColumns = n.columns.length === 0;
        this.columns = RED.nodes.getNode(n.columns).columns;
        this.where = RED.nodes.getNode(n.where).columns;
        this.group = RED.nodes.getNode(n.group).columns;
        this.order = RED.nodes.getNode(n.order).columns;
        this.table = n.table;
        this.noWhere = n.noWhere;
        this.limit = n.limit || 0;
        this.offset = n.offset || 0;

        node.on("input",function (msg) {
            try {
                var where = {};
                if (!node.noWhere) {
                    where = _prepareColumns(msg.payload,node.where);
                }
                if ( !node.requireAll || (node.columns.length === Object.keys(where).length ) ) {
                    //Build query
                    var query = pgBuilder(node.table),
                        limit = node.limit,
                        offset = node.offset,
                        group = node.group,
                        order = node.order;

                    if (!limit)  {
                        limit = msg.limit ? msg.limit : 0;
                    }

                    if (!offset)  {
                        offset = msg.offset ? msg.offset : 0;
                    }

                    query = (node.allColumns ? query.select() : query.select(node.columns));

                    if (limit) {
                        query = query.limit(limit);
                    }

                    if (group.length) {
                        query = query.groupBy(group);
                    }

                    if (order.length) {
                        query = query.orderBy(order);
                    }

                    if (Object.keys(where).length > 0) {
                        query = query.where(where);
                    }

                    node.send({
                        payload : query.offset(offset).toString()
                    });
                } else {
                    node.error("One or more columns are missing");
                }
            } catch (e) {
                node.error(e.message);
            }
        });
    }

    RED.nodes.registerType("PG Connection",PostgresNode);
    RED.nodes.registerType("PG Insert",PostgresNodeInsert);
    RED.nodes.registerType("PG Update",PostgresNodeUpdate);
    RED.nodes.registerType("PG Select",PostgresNodeSelect);
};
