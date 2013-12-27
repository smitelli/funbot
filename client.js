'use strict';

var config  = require('config'),
    lodash  = require('lodash'),
    sqlite3 = require('sqlite3'),
    wobot   = require('wobot'),
    Rooms   = require('./lib/rooms'),
    Users   = require('./lib/users'),
    bot     = new wobot.Bot(config.botParams);

bot.db    = new sqlite3.Database('./db/development.sqlite'),
bot.rooms = new Rooms(bot),
bot.users = new Users(bot);

bot.onMessage(function () {
    console.log(' -=- > Message', arguments);
});

bot.onPrivateMessage(function () {
    console.log(' -=- > PrivateMessage', arguments);
});

bot.onInvite(function () {
    console.log(' -=- > Invite', arguments);
    this.join(arguments[0]);
});

bot.onPing(function () {
    this.getRooms(lodash.bind(function(err, rooms) {
        if (err) {
            return;
        }

        this.rooms.refresh(rooms);
    }, this));

    this.getRoster(lodash.bind(function(err, roster) {
        if (err) {
            return;
        }

        this.users.refresh(roster);
    }, this));
});

config.loadPlugins.forEach(function (pluginFile) {
    bot.loadPlugin(pluginFile, require(pluginFile));
});

bot.connect();

bot.jabber.connection.socket.setTimeout(0);
bot.jabber.connection.socket.setKeepAlive(true, 10000);
