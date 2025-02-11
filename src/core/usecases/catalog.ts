import type { ThunkAction } from "../setup";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { CompiledData } from "sill-api";
import { removeReferent, languages } from "sill-api";
import { id } from "tsafe/id";
import { assert } from "tsafe/assert";
import type { ThunksExtraArgument, RootState } from "../setup";
import { waitForDebounceFactory } from "core/tools/waitForDebounce";
import memoize from "memoizee";
import { exclude } from "tsafe/exclude";
import { thunks as userAuthenticationThunks } from "./userAuthentication";
import { createResolveLocalizedString } from "i18nifty";
import { removeDuplicates } from "evt/tools/reducers/removeDuplicates";

type CatalogExplorerState = CatalogExplorerState.NotFetched | CatalogExplorerState.Ready;

namespace CatalogExplorerState {
    export type Common = {
        search: string;
    };

    export type NotFetched = Common & {
        stateDescription: "not fetched";
        isFetching: boolean;
    };

    export type Ready = Common & {
        stateDescription: "ready";
        "~internal": {
            softwares: CompiledData.Software<"without referents">[];
            referentsBySoftwareId:
                | undefined
                | Record<
                      string,
                      {
                          referents: CompiledData.Software.WithReferent["referents"];
                          userIndex: number | undefined;
                      }
                  >;
            displayCount: number;
            isProcessing: boolean;
        };
    };
}

export const { name, reducer, actions } = createSlice({
    "name": "catalog",
    "initialState": id<CatalogExplorerState>(
        id<CatalogExplorerState.NotFetched>({
            "stateDescription": "not fetched",
            "isFetching": false,
            "search": "",
        }),
    ),
    "reducers": {
        "catalogsFetching": state => {
            assert(state.stateDescription === "not fetched");
            state.isFetching = true;
        },
        "catalogsFetched": (
            state,
            {
                payload,
            }: PayloadAction<
                Pick<
                    CatalogExplorerState.Ready["~internal"],
                    "softwares" | "referentsBySoftwareId"
                >
            >,
        ) => {
            const { softwares, referentsBySoftwareId } = payload;

            return id<CatalogExplorerState.Ready>({
                "stateDescription": "ready",
                "~internal": {
                    softwares,
                    referentsBySoftwareId,
                    "displayCount": 24,
                    "isProcessing": false,
                },
                "search": state.search,
            });
        },
        "setSearch": (state, { payload }: PayloadAction<{ search: string }>) => {
            const { search } = payload;

            state.search = search;

            if (search === "" && state.stateDescription === "ready") {
                state["~internal"].displayCount = 24;
            }
        },
        "moreLoaded": state => {
            assert(state.stateDescription === "ready");

            state["~internal"].displayCount += 24;
        },
        "processingStarted": state => {
            assert(state.stateDescription === "ready");

            state["~internal"].isProcessing = true;
        },
        "userDeclaredReferent": (
            state,
            {
                payload,
            }: PayloadAction<{
                email: string;
                agencyName: string;
                firstName: string;
                familyName: string;
                isExpert: boolean;
                useCaseDescription: string;
                isPersonalUse: boolean;
                softwareId: number;
            }>,
        ) => {
            const {
                agencyName,
                softwareId,
                firstName,
                familyName,
                isExpert,
                email,
                useCaseDescription,
                isPersonalUse,
            } = payload;

            assert(state.stateDescription === "ready");

            const { referentsBySoftwareId } = state["~internal"];

            assert(referentsBySoftwareId !== undefined);

            const referents = referentsBySoftwareId[softwareId];

            referents.referents.push({
                email,
                agencyName,
                firstName,
                familyName,
                isExpert,
                useCaseDescription,
                isPersonalUse,
            });

            referents.userIndex = referents.referents.length - 1;

            state["~internal"].isProcessing = false;
        },
        "userNoLongerReferent": (
            state,
            {
                payload,
            }: PayloadAction<{
                softwareId: number;
            }>,
        ) => {
            const { softwareId } = payload;

            assert(state.stateDescription === "ready");

            const { referentsBySoftwareId } = state["~internal"];

            assert(referentsBySoftwareId !== undefined);

            const referents = referentsBySoftwareId[softwareId];

            const { userIndex } = referents;

            assert(userIndex !== undefined);

            referents.referents.splice(userIndex, 1);

            referents.userIndex = undefined;

            state["~internal"].isProcessing = false;
        },
        "softwareAddedOrUpdated": (
            state,
            {
                payload,
            }: PayloadAction<{ software: CompiledData.Software<"with referents"> }>,
        ) => {
            const { software } = payload;

            if (state.stateDescription === "not fetched") {
                return;
            }

            const { softwares, referentsBySoftwareId } = state["~internal"];

            const oldSoftware = softwares.find(({ id }) => id === software.id);

            if (oldSoftware !== undefined) {
                softwares[softwares.indexOf(oldSoftware)!] = removeReferent(software);
            } else {
                softwares.push(removeReferent(software));

                assert(referentsBySoftwareId !== undefined);

                referentsBySoftwareId[software.id] = {
                    "referents": software.referents,
                    "userIndex": 0,
                };
            }
        },
    },
});

export const thunks = {
    "fetchCatalog":
        (): ThunkAction =>
        async (...args) => {
            const [dispatch, , { sillApiClient, oidcClient }] = args;

            dispatch(actions.catalogsFetching());

            dispatch(
                actions.catalogsFetched({
                    "softwares": (await sillApiClient.getCompiledData()).catalog,
                    "referentsBySoftwareId": !oidcClient.isUserLoggedIn
                        ? undefined
                        : await (async () => {
                              const { email } = dispatch(
                                  userAuthenticationThunks.getUser(),
                              );

                              return Object.fromEntries(
                                  Object.entries(
                                      await sillApiClient.getReferentsBySoftwareId(),
                                  ).map(([softwareId, referents]) => [
                                      softwareId,
                                      {
                                          referents,
                                          "userIndex": (() => {
                                              const userReferent = referents.find(
                                                  referent => referent.email === email,
                                              );

                                              return userReferent === undefined
                                                  ? undefined
                                                  : referents.indexOf(userReferent);
                                          })(),
                                      },
                                  ]),
                              );
                          })(),
                }),
            );
        },
    "setSearch":
        (params: { search: string }): ThunkAction =>
        async (...args) => {
            const { search } = params;
            const [dispatch, , extra] = args;

            const sliceContext = getSliceContext(extra);

            const { prevSearch, waitForSearchDebounce } = sliceContext;

            sliceContext.prevSearch = search;

            //NOTE: At least 3 character to trigger search
            if (search !== "" && search.length <= 2) {
                return;
            }

            debounce: {
                //NOTE: We do note debounce if we detect that the search was restored from url or pasted.
                if (Math.abs(search.length - prevSearch.length) > 1) {
                    break debounce;
                }

                await waitForSearchDebounce();
            }

            dispatch(actions.setSearch({ search }));
        },
    "loadMore":
        (): ThunkAction =>
        async (...args) => {
            const [dispatch, , extraArg] = args;

            const { waitForLoadMoreDebounce } = getSliceContext(extraArg);

            await waitForLoadMoreDebounce();

            dispatch(actions.moreLoaded());
        },
    "getHasMoreToLoad":
        (): ThunkAction<boolean> =>
        (...args) => {
            const [, getState] = args;

            const state = getState().catalog;

            assert(state.stateDescription === "ready");

            const { displayCount, softwares } = state["~internal"];

            return state.search === "" && displayCount < softwares.length;
        },
    "declareUserReferent":
        (params: {
            isExpert: boolean;
            useCaseDescription: string;
            isPersonalUse: boolean;
            softwareId: number;
        }): ThunkAction =>
        async (...args) => {
            const { isExpert, useCaseDescription, isPersonalUse, softwareId } = params;

            const [dispatch, getState, { sillApiClient }] = args;

            const state = getState().catalog;

            assert(state.stateDescription === "ready");

            dispatch(actions.processingStarted());

            await sillApiClient.declareUserReferent({
                isExpert,
                softwareId,
                useCaseDescription,
                isPersonalUse,
            });

            const { agencyName, email } = dispatch(userAuthenticationThunks.getUser());

            dispatch(
                actions.userDeclaredReferent({
                    agencyName,
                    email,
                    "firstName": "",
                    "familyName": "",
                    isExpert,
                    softwareId,
                    useCaseDescription,
                    isPersonalUse,
                }),
            );
        },
    "userNoLongerReferent":
        (params: { softwareId: number }): ThunkAction =>
        async (...args) => {
            const { softwareId } = params;

            const [dispatch, getState, { sillApiClient }] = args;

            const state = getState().catalog;

            assert(state.stateDescription === "ready");

            dispatch(actions.processingStarted());

            await sillApiClient.userNoLongerReferent({
                softwareId,
            });

            dispatch(
                actions.userNoLongerReferent({
                    softwareId,
                }),
            );
        },
};

export const privateThunks = {
    "initialize":
        (): ThunkAction<void> =>
        (...args) => {
            const [dispatch, , { evtAction }] = args;

            evtAction.$attach(
                action =>
                    action.sliceName === "softwareForm" &&
                    action.actionName === "softwareAddedOrUpdated"
                        ? [action.payload.software]
                        : null,
                software => dispatch(actions.softwareAddedOrUpdated({ software })),
            );
        },
};

const getSliceContext = memoize((_: ThunksExtraArgument) => {
    return {
        "waitForSearchDebounce": waitForDebounceFactory({ "delay": 750 }).waitForDebounce,
        "waitForLoadMoreDebounce": waitForDebounceFactory({ "delay": 50 })
            .waitForDebounce,
        "prevSearch": "",
    };
});

export const selectors = (() => {
    const getSoftwareWeight = memoize(
        (software: CompiledData.Software): number =>
            JSON.stringify(software).length -
            (software.wikidataData?.logoUrl === undefined ? 10000 : 0),
    );

    const readyState = (rootState: RootState): CatalogExplorerState.Ready | undefined => {
        const state = rootState.catalog;
        switch (state.stateDescription) {
            case "ready":
                return state;
            default:
                return undefined;
        }
    };

    const referentsBySoftwareId = createSelector(readyState, state => {
        if (state === undefined) {
            return undefined;
        }
        return state["~internal"].referentsBySoftwareId;
    });

    const filteredSoftwares = createSelector(readyState, state => {
        if (state === undefined) {
            return undefined;
        }

        const {
            search,
            "~internal": { softwares, displayCount, referentsBySoftwareId },
        } = state;

        return [...softwares]
            .map(software => ({
                software,
                "isUserReferent":
                    referentsBySoftwareId?.[software.id].userIndex !== undefined,
            }))
            .sort((a, b) => getSoftwareWeight(b.software) - getSoftwareWeight(a.software))
            .sort((a, b) =>
                a.isUserReferent === b.isUserReferent ? 0 : a.isUserReferent ? -1 : 1,
            )
            .slice(0, search === "" ? displayCount : softwares.length)
            .map(({ software }) => software)
            .map(software =>
                software.dereferencing !== undefined ? undefined : software,
            )
            .filter(exclude(undefined))
            .filter(
                search === ""
                    ? () => true
                    : ({
                          id,
                          name,
                          function: fn,
                          license,
                          comptoirDuLibreSoftware,
                          wikidataData,
                      }) =>
                          [
                              name,
                              fn,
                              license,
                              comptoirDuLibreSoftware?.name,
                              ...(["description", "label"] as const)
                                  .map(prop =>
                                      languages
                                          .map(language => {
                                              const description = wikidataData?.[prop];

                                              if (description === undefined) {
                                                  return undefined;
                                              }

                                              const { resolveLocalizedString } =
                                                  createResolveLocalizedString({
                                                      "currentLanguage": language,
                                                      "fallbackLanguage": "en",
                                                  });

                                              return resolveLocalizedString(description);
                                          })
                                          .filter(exclude(undefined))
                                          .reduce(...removeDuplicates<string>()),
                                  )
                                  .flat(),
                              wikidataData?.sourceUrl,
                              wikidataData?.websiteUrl,
                              ...(referentsBySoftwareId === undefined
                                  ? []
                                  : referentsBySoftwareId[id].referents
                                        .map(({ email, agencyName }) => [
                                            email,
                                            agencyName,
                                        ])
                                        .flat()),
                          ]
                              .map(e => (!!e ? e : undefined))
                              .filter(exclude(undefined))
                              .map(str => {
                                  const format = (str: string) =>
                                      str
                                          .normalize("NFD")
                                          .replace(/[\u0300-\u036f]/g, "")
                                          .toLowerCase();

                                  return format(str).includes(format(search));
                              })
                              .indexOf(true) >= 0,
            );
    });

    const softwareNameBySoftwareId = createSelector(readyState, state => {
        if (state === undefined) {
            return undefined;
        }

        const {
            "~internal": { softwares },
        } = state;

        const softwareNameBySoftwareId: Record<number, string> = {};

        softwares.forEach(({ id, name }) => (softwareNameBySoftwareId[id] = name));

        return softwareNameBySoftwareId;
    });

    const softwares = createSelector(readyState, state => {
        if (state === undefined) {
            return undefined;
        }

        const {
            "~internal": { softwares },
        } = state;

        return softwares;
    });

    const searchResultCount = createSelector(
        readyState,
        softwares,
        filteredSoftwares,
        (state, softwares, filteredSoftwares) => {
            if (state === undefined) {
                return undefined;
            }

            assert(softwares !== undefined);
            assert(filteredSoftwares !== undefined);

            const { search } = state;

            return search !== ""
                ? filteredSoftwares.length
                : softwares.filter(software => software.dereferencing === undefined)
                      .length;
        },
    );

    const alikeSoftwares = createSelector(
        readyState,
        filteredSoftwares,
        (state, filteredSoftwares) => {
            if (state === undefined) {
                return undefined;
            }

            assert(filteredSoftwares !== undefined);

            const n = 3;

            if (filteredSoftwares.length > n) {
                return [];
            }

            return filteredSoftwares
                .slice(0, n)
                .map(({ alikeSoftwares }) =>
                    alikeSoftwares.map(softwareRef =>
                        softwareRef.isKnown
                            ? {
                                  "software": state["~internal"].softwares.find(
                                      s => s.id === softwareRef.softwareId,
                                  )!,
                                  "isKnown": true as const,
                              }
                            : softwareRef,
                    ),
                )
                .flat();
        },
    );

    const isProcessing = createSelector(readyState, state => {
        if (state === undefined) {
            return undefined;
        }
        return state["~internal"].isProcessing;
    });

    return {
        filteredSoftwares,
        alikeSoftwares,
        referentsBySoftwareId,
        isProcessing,
        softwareNameBySoftwareId,
        softwares,
        searchResultCount,
    };
})();
