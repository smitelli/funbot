'use strict';

var format  = require('util').format,
    path    = require('path'),
    config  = require('config'),
    sqlite3 = require('sqlite3'),
    wobot   = require('wobot'),
    Midware = require('./lib/middleware'),
    Rooms   = require('./lib/rooms'),
    Users   = require('./lib/users'),
    bot     = new wobot.Bot(config.botParams),
    watchdog;

/**
 * This function will initialize or clear/reset a watchdog timer. If the timer
 * is not continually re-armed within `watchdogTimeout` msec, the client will
 * die with an unhandled exception error. It can then be restarted externally.
 */
function armWatchdog () {
    clearInterval(watchdog);

    watchdog = setInterval(function () {
        throw new Error('Watchdog timeout expired.');
    }, config.watchdogTimeout);
}

// Initialize libraries and utilities and attach each to the bot
bot.db         = new sqlite3.Database('./db/development.sqlite');
bot.middleware = new Midware(bot);
bot.rooms      = new Rooms(bot);
bot.users      = new Users(bot);

// Connection callback handler
bot.onConnect(function () {
    // Receiving *any* data from the server will re-arm the watchdog timer
    this.on('data', armWatchdog);

    // Refresh the room list, then join all the ones from the presence table
    this.rooms.refresh(function () {
        this.rooms.autoJoin();
    });

    // Refresh the master user list
    this.users.refresh();
});

// Ping (keepalive) callback handler
bot.onPing(function () {
    // Refresh the room and master user list on each ping
    this.rooms.refresh();
    this.users.refresh();
});

// "Invited to room" callback handler
bot.onInvite(function (room, inviter) {
    var roomJid    = format('%s@%s', room.user,    room.domain),
        inviterJid = format('%s@%s', inviter.user, inviter.domain);

    // Refresh the room list, then join the specified room
    this.rooms.refresh(function () {
        this.rooms.join(roomJid, inviterJid);
    });
});

// Loop through each configured middleware plugin and register it with the bot's
// main middleware handler.
config.loadMiddleware.forEach(function (middlewareName) {
    var middlewarePath = path.join(__dirname, 'plugins', middlewareName);

    this.middleware.register(require(middlewarePath));
}, bot);

// Arm the watchdog timer and connect to the server
armWatchdog();
bot.connect();
