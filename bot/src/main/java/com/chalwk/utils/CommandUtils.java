/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.utils;

import com.chalwk.config.Constants;
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import org.slf4j.Logger;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class CommandUtils {

    private static final Map<String, Long> ROLE_HIERARCHY = new LinkedHashMap<>() {{
        put("Pilot Under Training", Constants.ROLE_PILOT_UNDER_TRAINING);
        put("Charter Pilot", Constants.ROLE_CHARTER_PILOT);
        put("Senior Charter Pilot", Constants.ROLE_SENIOR_CHARTER_PILOT);
        put("Lead Pilot", Constants.ROLE_LEAD_PILOT);
        put("Instructor", Constants.ROLE_INSTRUCTOR);
    }};

    public static boolean checkAdminPermission(SlashCommandInteractionEvent event, Logger logger) {
        if (!PermissionChecker.isAdmin(event.getMember())) {
            event.reply("❌ You don't have permission to use this command!")
                    .setEphemeral(true)
                    .queue();
            return false;
        }
        return true;
    }

    public static Member getTargetMember(SlashCommandInteractionEvent event, Logger logger) {
        Member member = event.getOption("user").getAsMember();
        if (member == null) {
            event.reply("❌ User not found in this server!")
                    .setEphemeral(true)
                    .queue();
            return null;
        }
        return member;
    }

    public static Role getRoleByName(String roleName, Guild guild) {
        for (Map.Entry<String, Long> entry : ROLE_HIERARCHY.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(roleName)) {
                return guild.getRoleById(entry.getValue());
            }
        }
        return null;
    }

    public static Role getNextRole(Member member, Guild guild) {
        Role currentHighest = null;
        int currentIndex = -1;

        String[] roleNames = ROLE_HIERARCHY.keySet().toArray(new String[0]);
        for (int i = 0; i < roleNames.length; i++) {
            Role role = guild.getRoleById(ROLE_HIERARCHY.get(roleNames[i]));
            if (role != null && member.getRoles().contains(role)) {
                currentHighest = role;
                currentIndex = i;
            }
        }

        if (currentHighest == null) {
            return guild.getRoleById(Constants.ROLE_PILOT_UNDER_TRAINING);
        }

        if (currentIndex >= roleNames.length - 1) {
            return null;
        }

        return guild.getRoleById(ROLE_HIERARCHY.get(roleNames[currentIndex + 1]));
    }

    public static Role getPreviousRole(Member member, Guild guild) {
        Role currentHighest = null;
        int currentIndex = -1;

        String[] roleNames = ROLE_HIERARCHY.keySet().toArray(new String[0]);
        for (int i = 0; i < roleNames.length; i++) {
            Role role = guild.getRoleById(ROLE_HIERARCHY.get(roleNames[i]));
            if (role != null && member.getRoles().contains(role)) {
                currentHighest = role;
                currentIndex = i;
            }
        }

        if (currentHighest == null || currentIndex == 0) {
            return null;
        }

        return guild.getRoleById(ROLE_HIERARCHY.get(roleNames[currentIndex - 1]));
    }

    public static List<Role> getAllHierarchyRoles(Member member) {
        return member.getRoles().stream()
                .filter(role -> ROLE_HIERARCHY.containsValue(role.getIdLong()))
                .toList();
    }

    public static Map<String, Long> getRoleHierarchy() {
        return ROLE_HIERARCHY;
    }

    public static void logAction(String action, Member targetMember, Role targetRole,
                                 SlashCommandInteractionEvent event, Logger logger) {
        if (Constants.CHANNEL_LOGS != 0) {
            event.getGuild().getTextChannelById(Constants.CHANNEL_LOGS)
                    .sendMessageEmbeds(EmbedUtils.createLogEmbed(
                            "Member " + action,
                            "**Admin:** " + event.getUser().getAsTag() +
                                    "\n**Member:** " + targetMember.getUser().getAsTag() +
                                    "\n**New Role:** " + targetRole.getName(),
                            Constants.BOT_COLOR
                    )).queue();
        }

        logger.info("User {} {} to {} by {}",
                targetMember.getUser().getAsTag(),
                action.toLowerCase() + "d",
                targetRole.getName(),
                event.getUser().getAsTag());
    }

    public static void sendSuccessReply(SlashCommandInteractionEvent event, String action,
                                        Member member, Role role) {
        event.reply("✅ Successfully " + action + " " + member.getAsMention() +
                        " to **" + role.getName() + "**!")
                .queue();
    }

    public static void sendErrorReply(SlashCommandInteractionEvent event, String message,
                                      Logger logger, Throwable error) {
        event.reply("❌ " + message)
                .setEphemeral(true)
                .queue();
        if (error != null) {
            logger.error(message, error);
        }
    }
}