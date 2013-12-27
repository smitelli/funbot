'use strict';

var config  = require('config'),
    sqlite3 = require('sqlite3').verbose(),
    wobot   = require('wobot'),
    Rooms   = require('./lib/rooms'),
    Users   = require('./lib/users');

var db = new sqlite3.Database('./db/development.sqlite'),
    b  = new wobot.Bot(config.botParams),
    r  = new Rooms(db),
    u  = new Users(db);

b.onMessage(function () {
    console.log(' -=- > Message', arguments);
});

b.onPrivateMessage(function () {
    console.log(' -=- > PrivateMessage', arguments);
});

b.onInvite(function () {
    console.log(' -=- > Invite', arguments);
    this.join(arguments[0]);
});

b.onPing(function () {
    console.log(' -=- > Ping', arguments);

    this.getRooms(function(err, rooms) {
        if (err) {
            return;
        }

        r.refresh(rooms);
    });

    this.getRoster(function(err, roster) {
        if (err) {
            return;
        }

        u.refresh(roster);
    });
});

b.connect();

b.jabber.connection.socket.setTimeout(0);
b.jabber.connection.socket.setKeepAlive(true, 10000);
