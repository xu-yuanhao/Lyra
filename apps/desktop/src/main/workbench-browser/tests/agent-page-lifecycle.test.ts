import { expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createSharedControlController } from "../view-manager-runtime/shared-control-controller";
import { observeAgentNavigation } from "../view-manager-runtime/agent-navigation-ready";
import { navigateAgentHistory } from "../view-manager-runtime/agent-history-navigation";

test("an action failure retains the live page until the task actually ends; a later task reopens its lifetime",()=>{
  const host=createSharedControlController({publishEvent:()=>{},getLiveEntry:()=>undefined,readAgentFollowFinalPageState:()=>null});
  const action=(result:"failure"|"success")=>host.recordFollowAction("verify","live","type",{visibleFollow:true,inputActive:true,result});
  action("failure");expect(host.hasActiveLiveAgentBrowserTask("verify")).toBe(true);
  host.finishAgentFollowSessions({status:"failed"});expect(host.hasActiveLiveAgentBrowserTask("verify")).toBe(false);
  action("success");expect(host.hasActiveLiveAgentBrowserTask("verify")).toBe(true);
  host.finishAgentFollowSessions({status:"completed"});expect(host.hasActiveLiveAgentBrowserTask("verify")).toBe(false);
});

test("navigation observation handles fast readiness and cleans up listeners",async()=>{
  const contents=new EventEmitter();
  const observer=observeAgentNavigation(contents as never,200,"https://test/destination");
  contents.emit("did-navigate",{},"about:blank");
  contents.emit("dom-ready");
  expect(contents.listenerCount("dom-ready")).toBe(1);
  contents.emit("did-navigate",{},"https://test/destination");
  contents.emit("dom-ready");
  expect(await observer.done).toBe("ready");
  expect(contents.eventNames()).toHaveLength(0);
});

test("a task protects its page even when visual follow is disabled",()=>{
  const host=createSharedControlController({publishEvent:()=>{},getLiveEntry:()=>undefined,readAgentFollowFinalPageState:()=>null});
  browserAgentOperationContext.run({sessionId:"quiet",turnId:"quiet-turn"},()=>
    host.recordFollowAction("quiet-page","live","read",{visibleFollow:false,inputActive:false,result:"success"}));
  expect(host.hasActiveLiveAgentBrowserTask("quiet-page")).toBe(true);
  host.finishAgentFollowSessions({turnId:"other-turn",status:"completed"});
  expect(host.hasActiveLiveAgentBrowserTask("quiet-page")).toBe(true);
  host.finishAgentFollowSessions({turnId:"quiet-turn",status:"completed"});
  expect(host.hasActiveLiveAgentBrowserTask("quiet-page")).toBe(false);
});

test("history shortcuts execute one history operation and never pretend no history is success",async()=>{
  const contents=Object.assign(new EventEmitter(),{getURL:()=>"https://test/previous",isDestroyed:()=>false,
    navigationHistory:{canGoBack:()=>true,canGoForward:()=>false,goBack:vi.fn(()=>contents.emit("did-navigate",{},"https://test/previous")),goForward:vi.fn()}});
  expect(await navigateAgentHistory(contents as never,"back")).toMatchObject({ok:true,status:"navigated"});
  expect(contents.navigationHistory.goBack).toHaveBeenCalledTimes(1);
  expect(await navigateAgentHistory(contents as never,"forward")).toMatchObject({ok:false,error:{kind:"history_unavailable"}});
  expect(contents.navigationHistory.goForward).not.toHaveBeenCalled();
  expect(contents.eventNames()).toHaveLength(0);
});

test("unconfirmed history navigation does not report success",async()=>{
  vi.useFakeTimers();
  try {
    const contents=Object.assign(new EventEmitter(),{getURL:()=>"https://test/unchanged",isDestroyed:()=>false,
      navigationHistory:{canGoBack:()=>true,goBack:vi.fn()}});
    const pending=navigateAgentHistory(contents as never,"back",100);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ok:false,status:"pending"});
    expect(contents.navigationHistory.goBack).toHaveBeenCalledTimes(1);
    expect(contents.eventNames()).toHaveLength(0);
  } finally {vi.useRealTimers();}
});

import { browserAgentOperationContext } from "../agent-operation-context";
test("finishing one task cannot release a page still used by another task",()=>{
  const host=createSharedControlController({publishEvent:()=>{},getLiveEntry:()=>undefined,readAgentFollowFinalPageState:()=>null});
  for(const turnId of ["a","b"]) browserAgentOperationContext.run({sessionId:turnId,turnId},()=>
    host.recordFollowAction("shared","live","read",{visibleFollow:true,inputActive:false,result:"success"}));
  host.finishAgentFollowSessions({turnId:"b",status:"completed"});
  expect(host.hasActiveLiveAgentBrowserTask("shared")).toBe(true);
  host.finishAgentFollowSessions({turnId:"a",status:"completed"});
  expect(host.hasActiveLiveAgentBrowserTask("shared")).toBe(false);
});

test("finishing a task hands agent-driven pages back to Chromium throttling", () => {
  const contents = { isDestroyed: () => false, setBackgroundThrottling: vi.fn() };
  const entry = { tabId: "shared", webContents: contents } as never;
  const host = createSharedControlController({
    publishEvent: () => {},
    entries: new Map([["shared", entry]]),
    getLiveEntry: () => entry,
    readAgentFollowFinalPageState: () => null
  });
  browserAgentOperationContext.run({ sessionId: "s", turnId: "t" }, () =>
    host.recordFollowAction("shared", "live", "read", { visibleFollow: true, inputActive: false, result: "success" }));
  host.finishAgentFollowSessions({ turnId: "other-turn", status: "completed" });
  expect(contents.setBackgroundThrottling).not.toHaveBeenCalled();
  host.finishAgentFollowSessions({ turnId: "t", status: "completed" });
  expect(contents.setBackgroundThrottling).toHaveBeenCalledWith(true);
});
