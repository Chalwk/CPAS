/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk;

import com.chalwk.commands.CommandManager;
import com.chalwk.commands.admin.AssignTrainingRoleCommand;
import com.chalwk.commands.general.HelpCommand;
import com.chalwk.commands.general.SimBriefPirepCommand;
import com.chalwk.commands.general.UpdateFlightCommand;
import com.chalwk.config.Config;
import com.chalwk.listeners.AutoRoleListener;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.OnlineStatus;
import net.dv8tion.jda.api.entities.Activity;
import net.dv8tion.jda.api.requests.GatewayIntent;
import net.dv8tion.jda.api.requests.restaction.CommandListUpdateAction;
import net.dv8tion.jda.api.utils.MemberCachePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class Main {
    private static final Logger logger = LoggerFactory.getLogger(Main.class);
    private static final List<CommandManager> COMMANDS = new ArrayList<>();
    private static final List<Object> LISTENERS = new ArrayList<>();
    private static JDA jda;

    private static String botToken = null;

    public static void main(String[] args) {
        try {
            logger.info("Starting CPAS Discord Bot...");

            Config.load();

            botToken = readTokenFromFile();
            if (botToken == null || botToken.isEmpty()) {
                logger.error("Bot token not found or empty. Please create a 'bot.token' file with your token.");
                System.exit(1);
            }

            initializeCommands();
            initializeListeners();

            jda = JDABuilder.createDefault(botToken)
                    .setStatus(OnlineStatus.ONLINE)
                    .setActivity(Activity.playing("Coastal Peaks Air Service"))
                    .enableIntents(
                            GatewayIntent.GUILD_MEMBERS,
                            GatewayIntent.GUILD_MESSAGES,
                            GatewayIntent.MESSAGE_CONTENT,
                            GatewayIntent.GUILD_PRESENCES
                    )
                    .setMemberCachePolicy(MemberCachePolicy.ALL)
                    .addEventListeners(LISTENERS.toArray())
                    .build();

            jda.awaitReady();

            CommandListUpdateAction commands = jda.updateCommands();
            for (CommandManager command : COMMANDS) {
                commands.addCommands(command.getCommandData());
            }
            commands.queue();

            logger.info("Registered {} slash commands globally", COMMANDS.size());

            logger.info("CPAS Bot is now online! Logged in as: {}", jda.getSelfUser().getAsTag());

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                logger.info("Shutting down CPAS Bot...");
                if (jda != null) {
                    jda.shutdown();
                }
            }));

        } catch (Exception e) {
            logger.error("Failed to start CPAS Bot", e);
            System.exit(1);
        }
    }

    private static void initializeCommands() {
        COMMANDS.add(new SimBriefPirepCommand());
        COMMANDS.add(new HelpCommand());
        COMMANDS.add(new AssignTrainingRoleCommand());
        COMMANDS.add(new UpdateFlightCommand());
    }

    private static void initializeListeners() {
        LISTENERS.addAll(COMMANDS);
        LISTENERS.add(new AutoRoleListener());
    }

    private static String readTokenFromFile() {
        if (botToken != null) {
            return botToken;
        }

        try {
            return Files.readString(Paths.get("bot.token")).trim();
        } catch (Exception e) {
            logger.error("Failed to read bot token file", e);
        }
        return null;
    }
}