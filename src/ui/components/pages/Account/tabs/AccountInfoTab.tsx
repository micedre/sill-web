import { memo } from "react";
import { declareComponentKeys } from "i18nifty";
import { useTranslation } from "ui/i18n";
import { AccountSectionHeader } from "../AccountSectionHeader";
import { DescriptiveField } from "../../../shared/DescriptiveField";
import { useCallbackFactory } from "powerhooks/useCallbackFactory";
import { copyToClipboard } from "ui/tools/copyToClipboard";
import Link from "@mui/material/Link";
import { makeStyles } from "ui/theme";
import { useThunks } from "ui/coreApi";

export type Props = {
    className?: string;
};

export const AccountInfoTab = memo((props: Props) => {
    const { className } = props;

    const { t } = useTranslation({ AccountInfoTab });

    const { userAuthenticationThunks } = useThunks();

    const onRequestCopyFactory = useCallbackFactory(([textToCopy]: [string]) =>
        copyToClipboard(textToCopy),
    );

    const user = userAuthenticationThunks.getUser();

    const keycloakAccountConfigurationUrl =
        userAuthenticationThunks.getKeycloakAccountConfigurationUrl();

    const { classes } = useStyles();

    return (
        <div className={className}>
            <AccountSectionHeader title={t("general information")} />
            <DescriptiveField
                type="text"
                title={t("email")}
                text={user.email}
                onRequestCopy={onRequestCopyFactory(user.email)}
            />
            <DescriptiveField
                type="text"
                title={t("agency name")}
                text={user.agencyName}
                onRequestCopy={onRequestCopyFactory(user.agencyName)}
            />

            {keycloakAccountConfigurationUrl !== undefined && (
                <Link
                    className={classes.link}
                    href={keycloakAccountConfigurationUrl}
                    target="_blank"
                    underline="hover"
                >
                    {t("change account info")}
                </Link>
            )}
        </div>
    );
});

export const { i18n } = declareComponentKeys<
    | "general information"
    | "user id"
    | "full name"
    | "email"
    | "change account info"
    | "agency name"
>()({ AccountInfoTab });

const useStyles = makeStyles({ "name": { AccountInfoTab } })(theme => ({
    "divider": {
        ...theme.spacing.topBottom("margin", 4),
    },
    "link": {
        "marginTop": theme.spacing(2),
        "display": "inline-block",
    },
}));
