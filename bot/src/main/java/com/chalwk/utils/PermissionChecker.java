/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.utils;

import com.chalwk.config.Constants;
import net.dv8tion.jda.api.Permission;
import net.dv8tion.jda.api.entities.Member;

import java.util.Arrays;

public class PermissionChecker {

    public static boolean isAdmin(Member member) {
        if (member == null) return false;

        if (member.hasPermission(Permission.ADMINISTRATOR))
            return true;

        if (Constants.ADMIN_IDS != null) {
            String userId = member.getId();
            return Arrays.asList(Constants.ADMIN_IDS).contains(userId);
        }

        return false;
    }
}