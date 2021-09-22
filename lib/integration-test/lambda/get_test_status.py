# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import boto3
import logging

# Initialize Logger
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

s3_client = boto3.resource('s3')

def get_test_status(event, context):
    LOGGER.info("Received event: %s", event)
    if 'wait_loop_count' in event:
        event['wait_loop_count'] = event['wait_loop_count'] + 1
    else:
        event['wait_loop_count'] = 0
    try:
        row_count = count_s3_records(event['FirehoseOutputBucket'])
        if(row_count == event['record_count']):
            event['status'] = "SUCCEEDED"
            return event
        elif event['wait_loop_count'] < 2:
            event['status'] = "PROCESSING"
            return event
        else:
            event['status'] = "FAILED"
            return event
    except Exception as e:
        LOGGER.exception("Error while validating output data records from S3.")
        return {'status': 'FAILED', 'guid':event, 'error_message': str(e) }

def count_s3_records(bucket_name):
    LOGGER.info("Counting data records in bucket: %s", bucket_name)
    bucket = s3_client.Bucket(bucket_name)
    record_count = 0
    for obj in bucket.objects.all():
        file_contents = obj.get()["Body"].read()
        record_count = record_count + file_contents.decode('utf-8').count('\n')
        verify_file_contents(file_contents)
    LOGGER.info("Obtained record_count: {} from bucket: {}".format(record_count, bucket_name))
    return record_count

def verify_file_contents(data_file):
    lines = data_file.split()
    for row in lines:
        data = json.loads(row.decode('utf8'))
        # Verify data
        if not ('approximate_arrival_timestamp' in data):
            raise Exception('Output verification failed. approximate_arrival_timestamp key not found.')

