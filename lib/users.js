'use strict';

var Users = function (bot) {
    this.db = bot.db;
};

Users.prototype.refresh = function (roster) {
    roster.forEach(function (user) {
        var jidParts = user.jid.match(/^(\d+)_(\d+)@.+$/);

        // If we can't extract a numeric ID for the primary key, skip this user
        if (!jidParts) {
            return;
        }

        this.db.run(
            'INSERT OR REPLACE INTO `users` (`id`, `jid`, `name`, `mention_name`) ' +
            'VALUES($id, $jid, $name, $mention_name)',
            {
                $id           : jidParts[2],
                $jid          : user.jid,
                $name         : user.name,
                $mention_name : user.mention_name
            }
        );
    }, this);
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
