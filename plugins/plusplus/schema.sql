CREATE TABLE `plusplus_data` (
    `users_id` INTEGER PRIMARY KEY NOT NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `last_award` INTEGER NOT NULL DEFAULT 0,
    `award_tries` INTEGER NOT NULL DEFAULT 0
);
