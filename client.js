'use strict';

var format  = require('util').format,
    config  = require('config'),
    sqlite3 = require('sqlite3'),
    wobot   = require('wobot'),
    Midware = require('./lib/middleware'),
    Rooms   = require('./lib/rooms'),
    Users   = require('./lib/users'),
    bot     = new wobot.Bot(config.botParams),
    watchdog;

function armWatchdog () {
    clearInterval(watchdog);

    watchdog = setInterval(function () {
        throw new Error('Watchdog timeout expired.');
    }, config.watchdogTimeout);
}

bot.db         = new sqlite3.Database('./db/development.sqlite');
bot.middleware = new Midware(bot);
bot.rooms      = new Rooms(bot);
bot.users      = new Users(bot);

bot.onConnect(function () {
    this.on('data', armWatchdog);

    this.rooms.refresh(function () {
        this.rooms.autoJoin();
    });

    this.users.refresh();
});

bot.onPing(function () {
    this.rooms.refresh();
    this.users.refresh();
});

bot.onInvite(function (room, inviter) {
    var roomJid    = format('%s@%s', room.user,    room.domain),
        inviterJid = format('%s@%s', inviter.user, inviter.domain);

    this.rooms.refresh(function () {
        this.rooms.join(roomJid, inviterJid);
    });
});

config.loadPlugins.forEach(function (pluginFile) {
    this.loadPlugin(pluginFile, require(pluginFile));
}, bot);

armWatchdog();
bot.connect();
