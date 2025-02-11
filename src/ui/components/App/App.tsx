import type { RefObject } from "react";
import { useMemo, useEffect, memo } from "react";
import { Header } from "ui/components/shared/Header";
import { LeftBar } from "ui/theme";
import { Footer } from "./Footer";
import { useLang, fallbackLanguage, evtLang, useTranslation } from "ui/i18n";
import { makeStyles, isViewPortAdapterEnabled } from "ui/theme";
import { useThunks } from "ui/coreApi";
import { useConstCallback } from "powerhooks/useConstCallback";
import { useRoute, routes } from "ui/routes";
import { useEffectOnValueChange } from "powerhooks/useEffectOnValueChange";
import { useDomRect, useSplashScreen } from "onyxia-ui";
import { Account } from "ui/components/pages/Account";
import { FourOhFour } from "ui/components/pages/FourOhFour";
import { Catalog } from "ui/components/pages/Catalog";
import { Form } from "ui/components/pages/Form";
import { SoftwareCard } from "ui/components/pages/SoftwareCard";
import { typeGuard } from "tsafe/typeGuard";
import { Language } from "sill-api";
import { id } from "tsafe/id";
import { createResolveLocalizedString } from "i18nifty";
import type { KcLanguageTag } from "keycloakify";
import { useConst } from "powerhooks/useConst";
import { useStickyTop } from "powerhooks/useStickyTop";
import { useWindowInnerSize } from "powerhooks/useWindowInnerSize";
import { languages } from "sill-api";
import { declareComponentKeys } from "i18nifty";
import { useElementEvt } from "evt/hooks/useElementEvt";
import { getScrollableParent } from "powerhooks/getScrollableParent";
import { Evt } from "evt";

export const logoContainerWidthInPercent = 4;

export type Props = {
    className?: string;
};

export const App = memo((props: Props) => {
    const { className } = props;

    const { t } = useTranslation({ App });

    useApplyLanguageSelectedAtLogin();

    const {
        domRect: { width: rootWidth },
        ref: rootRef,
    } = useDomRect();

    const {
        ref: headerRef,
        domRect: { height: headerHeight },
    } = useDomRect();
    const {
        ref: footerRef,
        domRect: { height: footerHeight },
    } = useDomRect();

    {
        const { hideRootSplashScreen } = useSplashScreen();

        useEffectOnValueChange(() => {
            hideRootSplashScreen();
        }, [rootWidth === 0]);
    }

    const { ref: refSticky, top } = useStickyTop();

    const { windowInnerHeight } = useWindowInnerSize();

    const { classes, cx } = useStyles({
        "leftBarTop": top,
        "leftBarHeight": windowInnerHeight - headerHeight - footerHeight,
    });

    const logoContainerWidth = Math.max(
        Math.floor((Math.min(rootWidth, 1920) * logoContainerWidthInPercent) / 100),
        45,
    );

    const route = useRoute();

    const { userAuthenticationThunks } = useThunks();

    const isUserLoggedIn = userAuthenticationThunks.getIsUserLoggedIn();

    const onHeaderAuthClick = useConstCallback(() =>
        isUserLoggedIn
            ? userAuthenticationThunks.logout({ "redirectTo": "home" })
            : userAuthenticationThunks.login(),
    );

    const tosUrl = (function useClosure() {
        const { lang } = useLang();
        const termsOfServices = useConst(() =>
            userAuthenticationThunks.getTermsOfServices(),
        );

        return useMemo(() => {
            if (termsOfServices === undefined) {
                return undefined;
            }

            const { resolveLocalizedString } =
                createResolveLocalizedString<KcLanguageTag>({
                    "currentLanguage": lang,
                    "fallbackLanguage": id<typeof fallbackLanguage>("en"),
                });

            return resolveLocalizedString(termsOfServices);
        }, [lang]);
    })();

    const { lang } = useLang();

    const leftBarItems = useMemo(
        () =>
            ({
                "account": {
                    "iconId": "account",
                    "label": t("account"),
                    "link": routes.account().link,
                    "hasDividerBelow": true,
                },
                "catalog": {
                    "iconId": "catalog",
                    "label": t("catalog"),
                    "link": routes.catalog().link,
                },
            } as const),
        [t, lang],
    );

    useRestoreScroll({ route, rootRef });

    return (
        <div ref={rootRef} className={cx(classes.root, className)}>
            {(() => {
                const common = {
                    "className": classes.header,
                    "useCase": "core app",
                    logoContainerWidth,
                    "logoLink": routes.home().link,
                    "ref": headerRef,
                } as const;

                return isUserLoggedIn ? (
                    <Header
                        {...common}
                        isUserLoggedIn={true}
                        onLogoutClick={onHeaderAuthClick}
                    />
                ) : (
                    <Header
                        {...common}
                        isUserLoggedIn={false}
                        onLoginClick={onHeaderAuthClick}
                    />
                );
            })()}
            <section className={classes.betweenHeaderAndFooter}>
                <LeftBar
                    ref={refSticky}
                    className={classes.leftBar}
                    collapsedWidth={logoContainerWidth}
                    reduceText={t("reduce")}
                    items={leftBarItems}
                    currentItemId={(() => {
                        switch (route.name) {
                            case "account":
                                return "account";
                            case "catalog":
                                return "catalog";
                        }
                    })()}
                />

                <main className={classes.main}>
                    <PageSelector route={route} />
                </main>
            </section>
            <Footer
                className={classes.footer}
                //NOTE: Defined in ./config-overrides.js
                packageJsonVersion={process.env.VERSION!}
                contributeUrl={"https://github.com/etalab/sill"}
                tosUrl={tosUrl}
                ref={footerRef}
            />
        </div>
    );
});

export const { i18n } = declareComponentKeys<"reduce" | "account" | "catalog">()({ App });

const useStyles = makeStyles<{ leftBarTop: number | undefined; leftBarHeight: number }>({
    "name": { App },
})((theme, { leftBarTop, leftBarHeight }) => ({
    "root": {
        "backgroundColor": theme.colors.useCases.surfaces.background,
        ...theme.spacing.rightLeft("padding", 4),
        "position": "relative",
        ...(!isViewPortAdapterEnabled
            ? {}
            : {
                  "height": "100%",
                  "overflow": "auto",
              }),
        // https://stackoverflow.com/questions/55211408/collapse-header-with-dynamic-height-on-scroll/55212530
        //"overflowAnchor": "none",
    },
    "header": (() => {
        if (isViewPortAdapterEnabled) {
            return {
                "position": "sticky",
                "top": 0,
            } as const;
        }

        return {};
    })(),
    "betweenHeaderAndFooter": {
        "display": "flex",
        "alignItems": "start",
    },
    "footer": {
        "height": 32,
        "position": "sticky",
        "bottom": 0,
    },
    "leftBar": {
        "position": "sticky",
        "top": leftBarTop,
        "height": leftBarHeight,
        "zIndex": 1,
        "display": (() => {
            if (isViewPortAdapterEnabled) {
                return undefined;
            }
            return "none";
        })(),
    },
    "main": {
        //TODO: See if scroll delegation works if we put auto here instead of "hidden"
        //"paddingLeft": theme.spacing(4),
        "& > *": {
            "marginLeft": theme.spacing(4),
        },
        "flex": 1,
    },
}));

const PageSelector = memo((props: { route: ReturnType<typeof useRoute> }) => {
    const { route } = props;

    const { userAuthenticationThunks } = useThunks();

    const isUserLoggedIn = userAuthenticationThunks.getIsUserLoggedIn();

    useEffect(() => {
        switch (route.name) {
            case "home":
                routes.catalog().replace();
                break;
            case "legacyRoute":
                {
                    {
                        const { lang } = route.params;

                        if (
                            typeGuard<Language>(
                                lang,
                                id<readonly string[]>(languages).includes(lang),
                            )
                        ) {
                            evtLang.state = lang;
                        }
                    }
                    const { id: softwareId } = route.params;

                    (softwareId === undefined
                        ? routes.catalog()
                        : routes.card({ "software": `${softwareId}` })
                    ).replace();
                }
                break;
        }
    }, [route.name]);

    /*
    Here is one of the few places in the codebase where we tolerate code duplication.
    We sacrifice dryness for the sake of type safety and flexibility.
    */
    {
        const Page = Catalog;

        if (Page.routeGroup.has(route)) {
            if (Page.getDoRequireUserLoggedIn() && !isUserLoggedIn) {
                userAuthenticationThunks.login();
                return null;
            }

            return <Page route={route} />;
        }
    }

    {
        const Page = Account;

        if (Page.routeGroup.has(route)) {
            if (Page.getDoRequireUserLoggedIn() && !isUserLoggedIn) {
                userAuthenticationThunks.login();
                return null;
            }

            return <Page route={route} />;
        }
    }

    {
        const Page = SoftwareCard;

        if (Page.routeGroup.has(route)) {
            if (Page.getDoRequireUserLoggedIn() && !isUserLoggedIn) {
                userAuthenticationThunks.login();
                return null;
            }

            return <Page route={route} />;
        }
    }

    {
        const Page = Form;

        if (Page.routeGroup.has(route)) {
            if (Page.getDoRequireUserLoggedIn() && !isUserLoggedIn) {
                userAuthenticationThunks.login();
                return null;
            }

            return <Page route={route} />;
        }
    }

    return <FourOhFour />;
});

/** On the login pages hosted by keycloak the user can select
 * a language, we want to use this language on the app.
 * For example we want that if a user selects english on the
 * register page while signing in that the app be set to english
 * automatically.
 */
function useApplyLanguageSelectedAtLogin() {
    const { userAuthenticationThunks } = useThunks();

    const isUserLoggedIn = userAuthenticationThunks.getIsUserLoggedIn();

    const { setLang } = useLang();

    useEffect(() => {
        if (!isUserLoggedIn) {
            return;
        }

        const { locale } = userAuthenticationThunks.getUser();

        if (
            !typeGuard<Language>(
                locale,
                locale !== undefined &&
                    locale in
                        id<Record<Language, null>>({
                            "en": null,
                            "fr": null,
                        }),
            )
        ) {
            return;
        }

        setLang(locale);
    }, []);
}

function useRestoreScroll(params: {
    route: ReturnType<typeof useRoute>;
    rootRef: RefObject<any>;
}) {
    const { route, rootRef } = params;

    const scrollTopByPageName = useConst((): Record<string, number> => ({}));

    useElementEvt(
        ({ ctx, element, registerSideEffect }) => {
            if (route.name === false) {
                return;
            }

            const scrollableElement = getScrollableParent({
                "doReturnElementIfScrollable": true,
                element,
            });

            //scrollableElement.style.scrollBehavior ="smooth";

            registerSideEffect(() => {
                const scrollTop = scrollTopByPageName[route.name] ?? 0;

                (async function callee(count: number) {
                    if (count === 0) {
                        return;
                    }

                    if (scrollableElement.scrollHeight < scrollTop) {
                        await new Promise(resolve => setTimeout(resolve, 150));
                        callee(count - 1);
                        return;
                    }

                    scrollableElement.scrollTo(0, scrollTop);
                })(4);
            });

            Evt.from(ctx, scrollableElement, "scroll").attach(() => {
                scrollTopByPageName[route.name] = scrollableElement.scrollTop;
            });
        },
        rootRef,
        [route.name],
    );
}
