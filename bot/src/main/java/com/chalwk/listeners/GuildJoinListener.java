/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.listeners;

import com.chalwk.config.Constants;
import com.chalwk.utils.EmbedUtils;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.guild.member.GuildMemberJoinEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GuildJoinListener extends ListenerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(GuildJoinListener.class);

    @Override
    public void onGuildMemberJoin(@NotNull GuildMemberJoinEvent event) {
        try {
            Role pendingRole = event.getGuild().getRoleById(Constants.ROLE_PENDING);
            if (pendingRole != null) {
                event.getGuild().addRoleToMember(event.getMember(), pendingRole).queue();
                logger.info("Assigned pending role to new member: {}", event.getUser().getAsTag());
            }

            if (Constants.CHANNEL_WELCOME != 0) {
                event.getGuild().getTextChannelById(Constants.CHANNEL_WELCOME)
                        .sendMessageEmbeds(EmbedUtils.createWelcomeEmbed(
                                "Welcome to Coastal Peaks Air Service!",
                                """
                                        **Welcome aboard, %s!** ✈️
                                        
                                        ## 🏔️ Coastal Peaks Air Service
                                        
                                        ### About Us
                                        CPAS is a virtual air charter operation set in New Zealand's South Island,
                                        offering scenic flights, glacier tours, and charter operations.
                                        
                                        ### Getting Started
                                        1. **Apply:** Submit a pilot application on GitHub
                                        2. **Wait:** Your application will be reviewed
                                        3. **Get Accepted:** A staff member will promote you from "Pending"
                                        4. **Start Flying:** Explore our routes and fleet
                                        
                                        ### Useful Links
                                        • Website: %s
                                        • GitHub: %s
                                        • Apply: https://github.com/Chalwk/CPAS/issues/new?template=pilot-application.yaml
                                        
                                        ### What Now?
                                        Please be patient while we review your application. 
                                        You'll receive a DM when you're accepted!
                                        
                                        **Blue skies and tailwinds!**
                                        """.formatted(event.getUser().getAsMention(),
                                        Constants.BOT_WEBSITE,
                                        Constants.BOT_GITHUB),
                                Constants.BOT_COLOR
                        )).queue();
            }

            event.getUser().openPrivateChannel().queue(channel -> EmbedUtils.sendPrivateMessage(channel,
                    "Welcome to CPAS!",
                    """
                            ## Welcome to Coastal Peaks Air Service! ✈️
                            
                            Thank you for joining our Discord server!
                            
                            ### What to Expect:
                            1. **Pending Status:** You'll start with the "Pending" role
                            2. **Application Review:** If you've applied, we'll review it shortly
                            3. **Acceptance:** You'll receive a DM when accepted
                            4. **Full Access:** Once accepted, you'll get access to all channels
                            
                            ### Need Help?
                            Feel free to ask questions in the welcome channel or DM a staff member.
                            
                            **We're excited to have you on board!**
                            """));

        } catch (Exception e) {
            logger.error("Error handling member join", e);
        }
    }
}