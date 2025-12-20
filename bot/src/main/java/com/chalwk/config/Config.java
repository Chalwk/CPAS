/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Properties;

public class Config {
    private static final Logger logger = LoggerFactory.getLogger(Config.class);
    private static final Properties properties = new Properties();

    public static void load() {
        try {
            File configFile = new File("config.properties");

            if (!configFile.exists()) {
                logger.warn("config.properties not found. Creating default configuration...");
                createDefaultConfig(configFile);
            }

            try (FileInputStream input = new FileInputStream(configFile)) {
                properties.load(input);
                logger.info("Configuration loaded successfully from config.properties");
            }

        } catch (IOException e) {
            logger.error("Failed to load configuration", e);
        }
    }

    private static void createDefaultConfig(File configFile) throws IOException {
        String defaultConfig = """
                # Discord Role IDs (for PIREP command permissions)
                role.pilot.under.training=1234567890
                role.charter.pilot=1234567890
                role.senior.charter.pilot=1234567890
                role.lead.pilot=1234567890
                role.instructor=1234567890
                # Channel IDs
                channel.pirep=1234567890
                # Command Settings
                admin.ids=123456789012345678,123456789012345678
                # Bot Settings
                bot.color=0x2d6bc9
                bot.name=CPAS Bot
                bot.website=https://chalwk.github.io/CPAS
                bot.github=https://github.com/Chalwk/CPAS
                # SimBrief API
                simbrief.api.key=your_api_key_here
                simbrief.api.baseurl=https://www.simbrief.com/api""";

        try (FileWriter writer = new FileWriter(configFile)) {
            writer.write(defaultConfig);
            logger.info("Default configuration created at config.properties");
        }
    }

    public static String getString(String key, String defaultValue) {
        return properties.getProperty(key, defaultValue);
    }

    public static long getLong(String key, long defaultValue) {
        try {
            String value = properties.getProperty(key);
            return value != null ? Long.parseLong(value) : defaultValue;
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    public static String[] getStringArray(String key) {
        String value = properties.getProperty(key);
        if (value == null || value.isEmpty()) {
            return new String[0];
        }
        return value.split(",");
    }
}