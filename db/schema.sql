CREATE TABLE `users` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `jid` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `mention_name` VARCHAR(255) NOT NULL
);

CREATE TABLE `rooms` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `jid` VARCHAR(255) NOT NULL,
    `users_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `topic` VARCHAR(255) NULL,
    `guest_url` VARCHAR(255) NULL,
    `num_participants` INTEGER NOT NULL,
    `privacy` VARCHAR(7) CHECK(`privacy` IN ('public', 'private')) NOT NULL,
    `is_archived` VARCHAR(5) CHECK(`is_archived` IN ('true', 'false')) NOT NULL
);
