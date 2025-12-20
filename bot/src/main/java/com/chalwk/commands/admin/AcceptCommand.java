/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.admin;

import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.utils.CommandUtils;
import com.chalwk.utils.EmbedUtils;
import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AcceptCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(AcceptCommand.class);

    @Override
    public String getCommandName() {
        return "accept";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Accept a pending member and grant them access")
                .addOptions(
                        new OptionData(OptionType.USER, "user", "The user to accept", true)
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

            Role pendingRole = event.getGuild().getRoleById(Constants.ROLE_PENDING);
            Role acceptedRole = event.getGuild().getRoleById(Constants.ROLE_ACCEPTED);

            if (pendingRole == null || acceptedRole == null) {
                CommandUtils.sendErrorReply(event,
                        "Roles are not configured properly. Please check bot configuration.",
                        logger, null);
                return;
            }

            if (!member.getRoles().contains(pendingRole)) {
                CommandUtils.sendErrorReply(event,
                        member.getEffectiveName() + " doesn't have the Pending role!",
                        logger, null);
                return;
            }

            event.getGuild().removeRoleFromMember(member, pendingRole).queue(
                    success -> event.getGuild().addRoleToMember(member, acceptedRole).queue(
                            success2 -> {
                                sendWelcomeMessage(member);
                                event.reply("✅ Successfully accepted " + member.getAsMention() + "!")
                                        .queue();

                                if (Constants.CHANNEL_LOGS != 0) {
                                    event.getGuild().getTextChannelById(Constants.CHANNEL_LOGS)
                                            .sendMessageEmbeds(EmbedUtils.createLogEmbed(
                                                    "Member Accepted",
                                                    "**Admin:** " + event.getUser().getAsTag() +
                                                            "\n**Member:** " + member.getUser().getAsTag() +
                                                            "\n**Action:** Changed role from Pending to Accepted",
                                                    Constants.BOT_COLOR
                                            )).queue();
                                }

                                logger.info("User {} accepted by {}", member.getUser().getAsTag(), event.getUser().getAsTag());
                            },
                            error -> CommandUtils.sendErrorReply(event,
                                    "Failed to add accepted role: " + error.getMessage(),
                                    logger, error)
                    ),
                    error -> CommandUtils.sendErrorReply(event,
                            "Failed to remove pending role: " + error.getMessage(),
                            logger, error)
            );

        } catch (Exception e) {
            CommandUtils.sendErrorReply(event,
                    "An error occurred: " + e.getMessage(),
                    logger, e);
        }
    }

    private void sendWelcomeMessage(Member member) {
        member.getUser().openPrivateChannel().queue(channel -> EmbedUtils.sendPrivateMessage(channel,
                "Welcome to Coastal Peaks Air Service!",
                """
                        ## 🎉 Your application has been accepted!
                        
                        **Welcome to Coastal Peaks Air Service!**
                        
                        ### What's Next?
                        1. **Read the Rules:** Check out #rules and #information
                        2. **Get Familiar:** Explore the available channels
                        3. **Start Flying:** Check #flight-ops for available routes
                        4. **Join Events:** Watch #announcements for community events
                        
                        ### Useful Links:
                        • Website: https://chalwk.github.io/CPAS
                        • GitHub: https://github.com/Chalwk/CPAS
                        
                        ### Need Help?
                        Feel free to ask questions in #general or DM a staff member.
                        
                        **Blue skies and tailwinds! ✈️**
                        """));
    }
}