# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import boto3
import datetime
import random
import logging

# Initialize Logger
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

kinesis = boto3.client('kinesis')

def generate_kinesis_events(event, context):
    try:
        LOGGER.info("Received event: %s", event)
        d=event
        for i in range(0, event['record_count']):
            data = json.dumps(getReferrer())
            kinesis.put_record(
                StreamName=d['KinesisInputStreamName'],
                Data=data,
                PartitionKey='partitionKey')
        return event
    except Exception as e:
        LOGGER.exception("Error while writing to Kinesis stream.")
        return {"status": "FAILED", "error_message": str(e)}

def getReferrer():
    data = {}
    now = datetime.datetime.now()
    str_now = now.isoformat()
    data['EVENT_TIME'] = str_now
    data['TICKER'] = random.choice(['AAPL', 'AMZN', 'MSFT', 'INTC', 'TBV'])
    price = random.random() * 100
    data['PRICE'] = round(price, 2)
    return data