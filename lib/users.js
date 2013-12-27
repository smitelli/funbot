'use strict';

var lodash  = require('lodash'),
    helpers = require('./helpers'),
    Users   = function (bot) {
        this.bot = bot;
        this.db = bot.db;
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
    this.db.get('SELECT * FROM `users` WHERE `jid` = ?', jid, callback);
};

Users.prototype.getByMentionName = function (mentionName, callback) {
    this.db.get('SELECT * FROM `users` WHERE `mention_name` = ?', mentionName, callback);
};

module.exports = Users;
