-- MySQL dump fixture
-- a semicolon ; inside a comment must not terminate a statement
/* a block comment ; with a semicolon too */

CREATE TABLE `countries` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL,
  `iso3166` char(2) DEFAULT NULL
);

INSERT INTO `countries` (`id`, `name`, `iso3166`) VALUES
(1, 'Sweden', 'SE'),
(2, 'Germany', 'DE');

CREATE TABLE `clients` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL,
  `title` varchar(10) DEFAULT NULL,
  `address` varchar(200) DEFAULT NULL,
  `notes` mediumtext,
  `id_company` int(10) NOT NULL,
  `id_status` int(10) NOT NULL,
  `id_list` int(10) NOT NULL,
  `id_country` int(10) NOT NULL,
  `is_active` char(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL
);

INSERT INTO `clients` (`id`, `name`, `title`, `address`, `notes`, `id_company`, `id_status`, `id_list`, `id_country`, `is_active`, `created_at`) VALUES
(1, 'John Hall', 'Mr.', '80 Spica Street', 'first line\r\nsecond; line with a semicolon\r\nand a quote: it''s here', 10, 1, 1, 1, '1', '2006-04-30 16:56:04'),
(2, 'Paula Marchetti', 'Ms.', NULL, NULL, 10, 2, 1, 2, '1', '2006-05-01 14:57:09'),
(3, 'S Y', '-', '', 'escaped \' quote and a backslash \\ here', 0, 12, 1, 2, '1', '0000-00-00 00:00:00');

CREATE TABLE `client_audit` (
  `id` int(10) UNSIGNED NOT NULL,
  `note` varchar(200) NOT NULL
);

INSERT INTO `client_audit` (`id`, `note`) VALUES
(1, 'archived and out of scope');

CREATE TABLE `companies` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL,
  `email` varchar(200) DEFAULT NULL,
  `site_url` varchar(250) DEFAULT NULL,
  `is_active` char(1) NOT NULL DEFAULT '1',
  `id_country` int(10) UNSIGNED NOT NULL,
  `company_type` enum('company','registry') NOT NULL DEFAULT 'company'
);

INSERT INTO `companies` (`id`, `name`, `email`, `site_url`, `is_active`, `id_country`, `company_type`) VALUES
(10, 'Northwind Bank', 'info@northwind.com', 'http://www.northwind.com/', '1', 1, 'company'),
(11, '-- Not Assigned --', NULL, NULL, '0', 0, 'company'),
(12, 'Acme Registry', NULL, NULL, '1', 2, 'registry');

CREATE TABLE `client_contacts` (
  `id` int(10) UNSIGNED NOT NULL,
  `contact` varchar(200) NOT NULL,
  `contact_type` enum('phone','email') NOT NULL DEFAULT 'phone',
  `is_active` char(1) NOT NULL DEFAULT '1',
  `id_client` int(10) UNSIGNED NOT NULL,
  `id_phone_type` int(10) UNSIGNED NOT NULL
);

INSERT INTO `client_contacts` (`id`, `contact`, `contact_type`, `is_active`, `id_client`, `id_phone_type`) VALUES
(1, 'tokonkwo@northwind.com', 'email', '1', 2, 0),
(2, '461234567', 'phone', '1', 2, 3),
(3, 'bad-number', 'phone', '1', 2, 1);

CREATE TABLE `phone_types` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL
);

INSERT INTO `phone_types` (`id`, `name`) VALUES
(1, 'Bus.'),
(3, 'Mob.');

CREATE TABLE `statuses` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL
);

INSERT INTO `statuses` (`id`, `name`) VALUES
(1, 'AVAILABLE'),
(2, 'To be Contacted'),
(12, 'Payment Landed');

CREATE TABLE `lists` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL
);

INSERT INTO `lists` (`id`, `name`) VALUES
(1, 'DEAL FULL LEASE');

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `username` varchar(200) NOT NULL
);

INSERT INTO `users` (`id`, `username`) VALUES
(1, 'admin');
