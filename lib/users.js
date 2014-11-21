'use strict';

var format = require('util').format,
    async   = require('async'),
    lodash  = require('lodash'),
    helpers = require('./helpers'),
    Users   = function (bot) {
        this.bot = bot;
        this.db  = bot.db;
    };

Users.prototype.refresh = function (callback) {
    var db = this.db,
        cb = lodash.bind(callback || lodash.noop, this.bot);

    this.bot.getRoster(function(err, roster) {
        if (err) {
            return;
        }

        db.serialize(function () {
            db.run('UPDATE `users` SET `touched` = 0');

            roster.forEach(function (user) {
                db.run(
                    'INSERT OR REPLACE INTO `users` (`id`, `jid`, `name`, `mention_name`, `touched`) ' +
                    'VALUES($id, $jid, $name, $mention_name, 1)',
                    {
                        $id           : helpers.jidToUserId(user.jid),
                        $jid          : user.jid,
                        $name         : user.name,
                        $mention_name : user.mention_name
                    }
                );
            });

            db.run('DELETE FROM `users` WHERE `touched` = 0', cb);
        });
    });
};

Users.prototype.getById = function (id, callback) {
    this.db.get('SELECT * FROM `users` WHERE `id` = ?', id, callback);
};

Users.prototype.getByJid = function (jid, callback) {
    this.db.get('SELECT * FROM `users` WHERE `jid` LIKE ?', jid, callback);
};

Users.prototype.getByName = function (name, callback) {
    this.db.get('SELECT * FROM `users` WHERE `name` LIKE ?', name, callback);
};

Users.prototype.getByMentionName = function (mentionName, callback) {
    this.db.get('SELECT * FROM `users` WHERE `mention_name` LIKE ?', mentionName, callback);
};

Users.prototype.getByFuzzyName = function (name, callback) {
    var db = this.db;

    // Treat '@Name' as if it was 'Name'
    name = name.replace(/^@/, '');

    async.series([
        function (cb) {
            // Look for rows where the mention_name matches exactly
            db.all('SELECT * FROM `users` WHERE `mention_name` LIKE ?', name, cb);
        },

        function (cb) {
            // Look for rows where the mention_name starts with the same prefix
            db.all('SELECT * FROM `users` WHERE `mention_name` LIKE ? || "%"', name, cb);
        },

        function (cb) {
            // Look for rows where the "human" name matches exactly
            db.all('SELECT * FROM `users` WHERE `name` LIKE ?', name, cb);
        },

        function (cb) {
            // Look for rows where the "human" name starts with the same prefix
            db.all('SELECT * FROM `users` WHERE `name` LIKE ? || "%"', name, cb);
        },

        function (cb) {
            // Look for rows where the mention_name contains the substring
            db.all('SELECT * FROM `users` WHERE `mention_name` LIKE "%" || ? || "%"', name, cb);
        },

        function (cb) {
            // Look for rows where the "human" name contains the substring
            db.all('SELECT * FROM `users` WHERE `name` LIKE "%" || ? || "%"', name, cb);
        }
    ], function (err, results) {
        var i;

        if (err) {
            return callback(err, null);
        }

        for (i = 0; i < results.length; i++) {
            if (results[i].length === 1) {
                return callback(null, results[i][0]);
            }
        }

        return callback(new Error(format("Sorry, I don't see a user with a name like `%s`.", name)), null);
    });
};

module.exports = Users;
