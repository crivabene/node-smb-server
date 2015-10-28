/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2015 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 **************************************************************************/

'use strict';

var put = require('put');
var logger = require('winston');
var Long = require('long');

var consts = require('../../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_SET_FILE_INFORMATION (0x0008): This transaction is an alternative to TRANS2_SET_PATH_INFORMATION.
 *
 * @param {Object} msg - an SMB message object
 * @param {Number} commandId - the command id
 * @param {Buffer} commandParams - the command parameters
 * @param {Buffer} commandData - the command data
 * @param {Number} commandParamsOffset - the command parameters offset within the SMB
 * @param {Number} commandDataOffset - the command data offset within the SMB
 * @param {Object} connection - an SMBConnection instance
 * @param {Object} server - an SMBServer instance
 * @param {Function} cb callback called with the command's result
 * @param {Object} cb.result - an object with the command's result params and data
 *                             or null if the handler already sent the response and
 *                             no further processing is required by the caller
 * @param {Number} cb.result.status
 * @param {Buffer} cb.result.params
 * @param {Buffer} cb.result.data
 */
function handle(msg, commandId, commandParams, commandData, commandParamsOffset, commandDataOffset, connection, server, cb) {
  var fid = commandParams.readUInt16LE(0);
  var informationLevel = commandParams.readUInt16LE(2);

  logger.debug('[%s] informationLevel: %s, fid: %d', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fid);

  var result;

  if (informationLevel != consts.SET_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
    result = {
      status: consts.STATUS_INVALID_PARAMETER,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: consts.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var off;
  var file = tree.getFile(fid);
  if (!file) {
    result = {
      status: consts.STATUS_SMB_BAD_FID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  switch (informationLevel) {
    case consts.SET_INFO_STANDARD:
    case consts.SET_INFO_EAS:
    case consts.SET_FILE_ALLOCATION_INFO:
      // todo implement
      logger.error('encountered unsupported informationLevel %s', consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel]);
      result = {
        status: consts.STATUS_NOT_IMPLEMENTED,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;

    case consts.SET_FILE_BASIC_INFO:
      // todo fix date parsing (allow for 0x0000000000000000 and 0xffffffffffffffff)
      off = 0;
      var creationTime = utils.readTimestamp(commandData, off);
      off += 8;
      var lastAccessTime = utils.readTimestamp(commandData, off);
      off += 8;
      var lastWriteTime = utils.readTimestamp(commandData, off);
      off += 8;
      var changeTime = utils.readTimestamp(commandData, off);
      off += 8;
      var extFileAttributes = commandData.readUInt32LE(off);
      off += 4;
      // todo implement according to https://msdn.microsoft.com/en-us/library/ff469851.aspx
      result = {
        status: consts.STATUS_SUCCESS,
        params: new Buffer(2),  // EaErrorOffset
        data: utils.EMPTY_BUFFER
      };
      cb(result);
      return;

    case consts.SET_FILE_DISPOSITION_INFO:
      var deletePending = !!commandData.readUInt8(0);
      if (deletePending) {
        file.delete(function (err) {
          if (err) {
            logger.error(err);
            result = {
              status: err.status || consts.STATUS_UNSUCCESSFUL,
              params: commandParams,
              data: commandData
            };
          } else {
            result = {
              status: consts.STATUS_SUCCESS,
              params: new Buffer(2),  // EaErrorOffset
              data: utils.EMPTY_BUFFER
            };
          }
          cb(result);
        });

      }
      return;

    case consts.SET_FILE_END_OF_FILE_INFO:
      var endOfFile = Long.fromBits(commandData.readUInt16LE(0), commandData.readUInt16LE(4), true).toNumber();
      file.setLength(endOfFile, function (err) {
        if (err) {
          logger.error(err);
          result = {
            status: err.status || consts.STATUS_UNSUCCESSFUL,
            params: commandParams,
            data: commandData
          };
        } else {
          result = {
            status: consts.STATUS_SUCCESS,
            params: new Buffer(2),  // EaErrorOffset
            data: utils.EMPTY_BUFFER
          };
        }
        cb(result);
      });
      return;

    default:
      result = {
        status: consts.STATUS_OS2_INVALID_LEVEL,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;
  }
}

module.exports = handle;