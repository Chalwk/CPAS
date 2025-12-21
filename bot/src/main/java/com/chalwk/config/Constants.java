/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.config;

public class Constants {
    public static long ROLE_PILOT_UNDER_TRAINING;
    public static long ROLE_CHARTER_PILOT;
    public static long ROLE_SENIOR_CHARTER_PILOT;
    public static long ROLE_LEAD_PILOT;
    public static long ROLE_INSTRUCTOR;
    public static long CHANNEL_PIREP;

    public static String[] ADMIN_IDS;

    public static int BOT_COLOR = 0x2d6bc9;
    public static String BOT_NAME = "CPAS Bot";
    public static String BOT_WEBSITE = "https://chalwk.github.io/CPAS";
    public static String BOT_GITHUB = "https://github.com/Chalwk/CPAS";

    static {
        loadFromConfig();
    }

    private static void loadFromConfig() {
        Config.load();

        ROLE_PILOT_UNDER_TRAINING = Config.getLong("role.pilot.under.training", 0L);
        ROLE_CHARTER_PILOT = Config.getLong("role.charter.pilot", 0L);
        ROLE_SENIOR_CHARTER_PILOT = Config.getLong("role.senior.charter.pilot", 0L);
        ROLE_LEAD_PILOT = Config.getLong("role.lead.pilot", 0L);
        ROLE_INSTRUCTOR = Config.getLong("role.instructor", 0L);
        CHANNEL_PIREP = Config.getLong("channel.pirep", 0L);
        ADMIN_IDS = Config.getStringArray("admin.ids");

        try {
            BOT_COLOR = Integer.decode(Config.getString("bot.color", "0x2d6bc9"));
        } catch (NumberFormatException e) {
            // Use default
        }

        BOT_NAME = Config.getString("bot.name", BOT_NAME);
        BOT_WEBSITE = Config.getString("bot.website", BOT_WEBSITE);
        BOT_GITHUB = Config.getString("bot.github", BOT_GITHUB);
    }
}