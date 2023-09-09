import * as encoding from "lib0/encoding";
import { AnnouncePresence, Change, Changes, Msg, tags } from "./msgTypes.js";

// TODO: we can compress most of this by:
// 1. adding varint encdoing support for bigints
// 2. creating a lookup table for `siteId`, `tblName`, `colName`
// But we should just go ahead and finally implement sync in native code.
// I think we finally know the right design after this third implementation.
export function encode(msg: Msg): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeUint8(encoder, msg._tag);

  switch (msg._tag) {
    case tags.AnnouncePresence:
      writeAnnouncePresenceSansTag(encoder, msg);
      return encoding.toUint8Array(encoder);
    case tags.Changes:
      writeChangesMsgSansTag(encoder, msg);
      return encoding.toUint8Array(encoder);
    case tags.RejectChanges:
      encoding.writeUint8Array(encoder, msg.whose);
      encoding.writeBigInt64(encoder, BigInt(msg.since[0]));
      encoding.writeVarInt(encoder, Number(msg.since[1]));
      return encoding.toUint8Array(encoder);
    case tags.StartStreaming:
      encoding.writeBigInt64(encoder, BigInt(msg.since[0]));
      encoding.writeVarInt(encoder, Number(msg.since[1]));
      encoding.writeVarUint(encoder, msg.excludeSites.length);
      for (const exclude of msg.excludeSites) {
        encoding.writeUint8Array(encoder, exclude);
      }
      encoding.writeUint8(encoder, msg.localOnly ? 1 : 0);
      return encoding.toUint8Array(encoder);
    case tags.CreateDbOnPrimary:
      encoding.writeVarInt(encoder, msg._reqid);
      encoding.writeVarString(encoder, msg.room);
      encoding.writeVarString(encoder, msg.schemaName);
      encoding.writeBigInt64(encoder, msg.schemaVersion);
      return encoding.toUint8Array(encoder);
    case tags.ApplyChangesOnPrimary:
      encoding.writeVarInt(encoder, msg._reqid);
      encoding.writeUint8Array(encoder, msg.sender);
      writeChanges(encoder, msg.changes);
      encoding.writeVarString(encoder, msg.room);
      encoding.writeBigInt64(encoder, BigInt(msg.newLastSeen[0]));
      encoding.writeVarInt(encoder, Number(msg.newLastSeen[1]));
      return encoding.toUint8Array(encoder);
    case tags.Ping:
    case tags.Pong:
      return encoding.toUint8Array(encoder);
    case tags.ApplyChangesOnPrimaryResponse:
      encoding.writeVarInt(encoder, msg._reqid);
      return encoding.toUint8Array(encoder);
    case tags.CreateDbOnPrimaryResponse:
      encoding.writeVarInt(encoder, msg._reqid);
      encoding.writeBigInt64(encoder, msg.txid);
      return encoding.toUint8Array(encoder);
    case tags.Err:
      encoding.writeVarInt(encoder, msg._reqid);
      encoding.writeVarString(encoder, msg.err);
      return encoding.toUint8Array(encoder);
  }
}

// Tag is expected to already have been written
function writeAnnouncePresenceSansTag(
  encoder: encoding.Encoder,
  msg: Omit<AnnouncePresence, "_tag">
) {
  encoding.writeUint8Array(encoder, msg.sender);
  encoding.writeVarUint(encoder, msg.lastSeens.length);
  for (const lastSeen of msg.lastSeens) {
    encoding.writeUint8Array(encoder, lastSeen[0]);
    // TODO: lib0 needs to support varbigints. This wastes a ton of space.
    encoding.writeBigInt64(encoder, BigInt(lastSeen[1][0]));
    encoding.writeVarInt(encoder, Number(lastSeen[1][1]));
  }
  encoding.writeVarString(encoder, msg.schemaName);
  encoding.writeBigInt64(encoder, msg.schemaVersion);
}

function writeChangesMsgSansTag(
  encoder: encoding.Encoder,
  msg: Omit<Changes, "_tag">
) {
  encoding.writeUint8Array(encoder, msg.sender);
  encoding.writeBigInt64(encoder, BigInt(msg.since[0]));
  encoding.writeVarInt(encoder, Number(msg.since[1]));
  writeChanges(encoder, msg.changes);
}

// export function decode(data: Uint8Array): Msg {}
export const NULL = 0;
export const BIGINT = 1;
export const NUMBER = 2;
export const STRING = 3;
export const BOOL = 4;
export const BLOB = 5;

function writeChanges(encoder: encoding.Encoder, changes: readonly Change[]) {
  encoding.writeVarUint(encoder, changes.length);
  for (const change of changes) {
    encoding.writeVarString(encoder, change[0]);
    encoding.writeVarUint8Array(encoder, change[1]);
    encoding.writeVarString(encoder, change[2]);
    writeValue(encoder, change[3]);
    // TODO: huge space wasters that we need to fix lib0 for
    // bigints should be variable length encoded
    encoding.writeBigInt64(encoder, BigInt(change[4]));
    encoding.writeBigInt64(encoder, BigInt(change[5]));
    const siteid = change[6];
    if (siteid == null) {
      encoding.writeUint8(encoder, NULL);
    } else {
      encoding.writeUint8(encoder, BLOB);
      encoding.writeUint8Array(encoder, siteid);
    }
    encoding.writeBigInt64(encoder, BigInt(change[7]));
    encoding.writeVarInt(encoder, Number(change[8]));
  }
}

function writeValue(encoder: encoding.Encoder, value: any) {
  // undefined will be encoded as null too.
  if (value == null) {
    encoding.writeUint8(encoder, NULL);
  } else {
    if (typeof value === "bigint") {
      encoding.writeUint8(encoder, BIGINT);
      encoding.writeBigInt64(encoder, value);
    } else if (typeof value === "number") {
      encoding.writeUint8(encoder, NUMBER);
      // JS numbers are floating points.
      encoding.writeFloat64(encoder, value);
    } else if (typeof value === "string") {
      encoding.writeUint8(encoder, STRING);
      encoding.writeVarString(encoder, value);
    } else if (typeof value === "boolean") {
      encoding.writeUint8(encoder, BOOL);
      encoding.writeUint8(encoder, value ? 1 : 0);
    } else if (value.constructor === Uint8Array) {
      encoding.writeUint8(encoder, BLOB);
      encoding.writeVarUint8Array(encoder, value);
    } else {
      console.log(value);
      throw new Error(`Unsupported value type: ${typeof value} ${value}`);
    }
  }
}
