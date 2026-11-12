import { describe, expect, it, vi } from "vitest";
import { authorizedChatChannel, messageBelongsToChannel } from "./historical-chat-scope";

describe("Round 49 private chat and message tenant scope",()=>{
  const mkDb=(kind:"PUBLIC"|"PRIVATE"|"DM"|"GROUP_DM", member:boolean, archived=false)=>({
    chatChannel:{findFirst:vi.fn(async()=>archived?null:{kind})},
    chatMember:{findUnique:vi.fn(async()=>member?{id:"membership"}:null)},
  });
  it("allows public channels but only subscribed members in private or DMs",async()=>{
    const pub=mkDb("PUBLIC",false);
    expect(await authorizedChatChannel(pub as never,"channel-a","user-a")).toBe("PUBLIC");
    expect(pub.chatMember.findUnique).not.toHaveBeenCalled();
    for(const kind of ["PRIVATE","DM","GROUP_DM"] as const){
      const notMember=mkDb(kind,false);
      expect(await authorizedChatChannel(notMember as never,"channel-a","user-a")).toBeNull();
      expect(notMember.chatMember.findUnique).toHaveBeenCalledWith({
        where:{channelId_userId:{channelId:"channel-a",userId:"user-a"}},select:{id:true},
      });
      expect(await authorizedChatChannel(mkDb(kind,true) as never,"channel-a","user-a")).toBe("MEMBER");
    }
    expect(await authorizedChatChannel(mkDb("PUBLIC",false,true) as never,"channel-a","user-a")).toBeNull();
    expect(await authorizedChatChannel(pub as never,"channel-a","")).toBeNull();
  });
  it("requires a reply to belong to the exact channel, not any message in the tenant",async()=>{
    const chatMessage={findFirst:vi.fn(async ({where}:{where:{channelId:string;id:string}})=>
      where.channelId==="channel-a" && where.id==="message-a" ? {id:"message-a"} : null)};
    expect(await messageBelongsToChannel({chatMessage} as never,"channel-a","message-a")).toBe(true);
    expect(await messageBelongsToChannel({chatMessage} as never,"channel-b","message-a")).toBe(false);
    expect(chatMessage.findFirst).toHaveBeenCalledWith({
      where:{id:"message-a",channelId:"channel-b",deletedAt:null},select:{id:true},
    });
  });
});
