/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.admin;

import com.chalwk.commands.CommandManager;
import com.chalwk.utils.CommandUtils;
import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionMapping;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PromoteCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(PromoteCommand.class);

    @Override
    public String getCommandName() {
        return "promote";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Promote a member to a higher role")
                .addOptions(
                        new OptionData(OptionType.USER, "user", "The user to promote", true),
                        new OptionData(OptionType.STRING, "role", "Specific role to promote to")
                                .addChoices(CommandUtils.getRoleHierarchy().keySet().stream()
                                        .map(role -> new net.dv8tion.jda.api.interactions.commands.Command.Choice(role, role))
                                        .toList())
                );
    }

    @Override
    public void onSlashCommandInteraction(@NotNull SlashCommandInteractionEvent event) {
        if (!event.getName().equals(getCommandName())) return;
        handleCommand(event);
    }

    @Override
    public void handleCommand(SlashCommandInteractionEvent event) {
        try {
            if (!CommandUtils.checkAdminPermission(event, logger)) return;

            Member member = CommandUtils.getTargetMember(event, logger);
            if (member == null) return;

            OptionMapping roleOption = event.getOption("role");
            Role targetRole;

            if (roleOption != null) {
                String targetRoleName = roleOption.getAsString();
                targetRole = CommandUtils.getRoleByName(targetRoleName, event.getGuild());
                if (targetRole == null) {
                    CommandUtils.sendErrorReply(event,
                            "Role not found! Available roles: " +
                                    String.join(", ", CommandUtils.getRoleHierarchy().keySet()),
                            logger, null);
                    return;
                }
            } else {
                targetRole = CommandUtils.getNextRole(member, event.getGuild());
                if (targetRole == null) {
                    CommandUtils.sendErrorReply(event,
                            member.getEffectiveName() + " is already at the highest role!",
                            logger, null);
                    return;
                }
            }

            Role finalTargetRole = targetRole;
            event.getGuild().addRoleToMember(member, targetRole)
                    .queue(
                            success -> {
                                CommandUtils.sendSuccessReply(event, "promoted", member, finalTargetRole);
                                CommandUtils.logAction("Promoted", member, finalTargetRole, event, logger);
                            },
                            error -> CommandUtils.sendErrorReply(event,
                                    "Failed to promote user: " + error.getMessage(),
                                    logger, error)
                    );

        } catch (Exception e) {
            CommandUtils.sendErrorReply(event,
                    "An error occurred: " + e.getMessage(),
                    logger, e);
        }
    }
}