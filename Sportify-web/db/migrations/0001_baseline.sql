-- Baseline schema, reconstructed from the queries in app/api as of SPO-3.
-- Every statement is CREATE TABLE IF NOT EXISTS so this is a no-op on the
-- existing production database; it fully builds a fresh (dev/CI) database.
-- Columns that production may be missing are reconciled in 0002.

CREATE TABLE IF NOT EXISTS Users (
  user_id    VARCHAR(128) NOT NULL PRIMARY KEY,
  name       VARCHAR(255),
  email      VARCHAR(255),
  global_pts FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Organisations (
  org_id        INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(128) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_org_owner (owner_user_id)
);

-- A "clan" is either a social group (type NULL / 'group') or an academy batch
-- (type 'batch', linked to an organisation and joined by invite code).
CREATE TABLE IF NOT EXISTS Clans (
  clan_id     INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  clan_rank   INT NOT NULL DEFAULT 0,
  type        VARCHAR(20) NULL,
  org_id      INT NULL,
  invite_code VARCHAR(16) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_clan_invite (invite_code),
  KEY idx_clan_org (org_id)
);

CREATE TABLE IF NOT EXISTS ClanMembers (
  user_id   VARCHAR(128) NOT NULL,
  clan_id   INT NOT NULL,
  role      VARCHAR(20) NOT NULL DEFAULT 'Member', -- Admin | Coach | Owner | Member
  join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, clan_id),
  KEY idx_cm_clan (clan_id)
);

CREATE TABLE IF NOT EXISTS ClanLeaderboard (
  clan_id        INT NOT NULL,
  user_id        VARCHAR(128) NOT NULL,
  clan_points    FLOAT NOT NULL DEFAULT 0,
  singles_points FLOAT NOT NULL DEFAULT 0,
  doubles_points FLOAT NOT NULL DEFAULT 0,
  matchesplayed  INT NOT NULL DEFAULT 0,
  matcheswon     INT NOT NULL DEFAULT 0,
  matcheslost    INT NOT NULL DEFAULT 0,
  last_updated   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clan_id, user_id)
);

CREATE TABLE IF NOT EXISTS InternalSeries (
  series_id     INT AUTO_INCREMENT PRIMARY KEY,
  clan_id       INT NOT NULL,
  series_type   VARCHAR(10) NOT NULL, -- singles | doubles
  series_name   VARCHAR(255),
  team1_name    VARCHAR(255),
  team2_name    VARCHAR(255),
  total_matches INT NOT NULL DEFAULT 0,
  winner_team   VARCHAR(255) NULL,
  start_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date      DATETIME NULL,
  Team1_players JSON,
  Team2_players JSON,
  KEY idx_series_clan (clan_id)
);

CREATE TABLE IF NOT EXISTS InternalSinglesMatches (
  match_id      INT AUTO_INCREMENT PRIMARY KEY,
  clan_id       INT NOT NULL,
  player_1      VARCHAR(128) NOT NULL,
  player_2      VARCHAR(128) NOT NULL,
  score_details TEXT,
  winner_player VARCHAR(128) NULL,
  series_id     INT NULL,
  match_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ism_clan (clan_id),
  KEY idx_ism_series (series_id)
);

CREATE TABLE IF NOT EXISTS InternalDoublesMatches (
  match_id      INT AUTO_INCREMENT PRIMARY KEY,
  clan_id       INT NOT NULL,
  team1_player1 VARCHAR(128) NOT NULL,
  team1_player2 VARCHAR(128) NOT NULL,
  team2_player1 VARCHAR(128) NOT NULL,
  team2_player2 VARCHAR(128) NOT NULL,
  score_details TEXT,
  winner_team   VARCHAR(10) NULL, -- team1 | team2
  series_id     INT NULL,
  match_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_idm_clan (clan_id),
  KEY idx_idm_series (series_id)
);

CREATE TABLE IF NOT EXISTS Tournaments (
  tournament_id     INT AUTO_INCREMENT PRIMARY KEY,
  clan_id           INT NOT NULL,
  tournament_name   VARCHAR(255) NOT NULL,
  tournament_type   VARCHAR(10) NOT NULL,  -- singles | doubles
  format            VARCHAR(20) NOT NULL,  -- round_robin | knockout | group_knockout
  status            ENUM('upcoming','ongoing','completed','open') NOT NULL DEFAULT 'upcoming',
  start_date        DATETIME NULL,
  end_date          DATETIME NULL,
  winner_team_id    INT NULL,
  teams_per_group   INT NOT NULL DEFAULT 2,
  is_hosted         TINYINT(1) NOT NULL DEFAULT 0,
  max_participants  INT NOT NULL DEFAULT 0,
  registration_mode VARCHAR(20) NOT NULL DEFAULT 'players',
  KEY idx_tourn_clan (clan_id)
);

CREATE TABLE IF NOT EXISTS TournamentTeams (
  team_id       INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id INT NOT NULL,
  team_name     VARCHAR(255) NOT NULL,
  players       JSON,
  KEY idx_tt_tourn (tournament_id)
);

CREATE TABLE IF NOT EXISTS TournamentGroups (
  group_id           INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id      INT NOT NULL,
  group_name         VARCHAR(100) NOT NULL,
  match_repeat_count INT NOT NULL DEFAULT 1,
  KEY idx_tg_tourn (tournament_id)
);

CREATE TABLE IF NOT EXISTS TournamentGroupTeams (
  group_id INT NOT NULL,
  team_id  INT NOT NULL,
  PRIMARY KEY (group_id, team_id)
);

CREATE TABLE IF NOT EXISTS TournamentMatches (
  match_id       INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  team1_id       INT NULL,
  team2_id       INT NULL,
  winner_team_id INT NULL,
  score_details  TEXT,
  match_stage    VARCHAR(100),
  match_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  round_number   INT NOT NULL DEFAULT 1,
  match_position INT NOT NULL DEFAULT 0,
  phase          VARCHAR(10) NOT NULL DEFAULT 'group', -- group | knockout
  team1_players  JSON NULL,
  team2_players  JSON NULL,
  KEY idx_tm_tourn (tournament_id)
);

CREATE TABLE IF NOT EXISTS HostedTournamentTeams (
  hosted_team_id       INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id        INT NOT NULL,
  team_name            VARCHAR(255) NOT NULL,
  created_by_user_id   VARCHAR(255) NOT NULL,
  created_by_user_name VARCHAR(255) NOT NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_team_name (tournament_id, team_name)
);

CREATE TABLE IF NOT EXISTS HostedTournamentRegistrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id   INT NOT NULL,
  user_id         VARCHAR(255) NOT NULL,
  user_name       VARCHAR(255) NOT NULL,
  hosted_team_id  INT NULL,
  registered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_tournament (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS Attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id      INT NOT NULL,
  session_date  DATE NOT NULL,
  session_name  VARCHAR(100),
  user_id       VARCHAR(255) NOT NULL,
  status        ENUM('present', 'absent', 'late') NOT NULL DEFAULT 'absent',
  marked_by     VARCHAR(255),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_attendance (batch_id, session_date, user_id)
);

CREATE TABLE IF NOT EXISTS BatchAnnouncements (
  announcement_id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id        INT NOT NULL,
  author_id       VARCHAR(255) NOT NULL,
  author_name     VARCHAR(255),
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  pinned          TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS OrgAnnouncements (
  announcement_id INT AUTO_INCREMENT PRIMARY KEY,
  org_id          INT NOT NULL,
  author_id       VARCHAR(255) NOT NULL,
  author_name     VARCHAR(255),
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  pinned          TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS TrainingSessions (
  session_id       INT AUTO_INCREMENT PRIMARY KEY,
  batch_id         INT NOT NULL,
  title            VARCHAR(200) NOT NULL DEFAULT 'Training Session',
  scheduled_at     DATETIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  notes            TEXT,
  created_by       VARCHAR(255),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS OrgTrainingSessions (
  session_id       INT AUTO_INCREMENT PRIMARY KEY,
  org_id           INT NOT NULL,
  title            VARCHAR(200) NOT NULL DEFAULT 'Training Session',
  scheduled_at     DATETIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  notes            TEXT,
  created_by       VARCHAR(255),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS GameSessions (
  session_id   INT AUTO_INCREMENT PRIMARY KEY,
  host_user_id VARCHAR(255) NOT NULL,
  host_name    VARCHAR(255),
  title        VARCHAR(200) NOT NULL,
  sport        VARCHAR(100),
  location     TEXT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  max_players  INT NOT NULL DEFAULT 4,
  description  TEXT,
  status       ENUM('open','full','completed','cancelled') DEFAULT 'open',
  skill_level  ENUM('any','beginner','intermediate','advanced') NOT NULL DEFAULT 'any',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS GameSessionPlayers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id    VARCHAR(255) NOT NULL,
  user_name  VARCHAR(255),
  joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_player (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS GameSessionMessages (
  message_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id    VARCHAR(255) NOT NULL,
  user_name  VARCHAR(255),
  message    TEXT NOT NULL,
  sent_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
