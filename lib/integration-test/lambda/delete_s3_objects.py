# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import boto3
import logging

# Initialize Logger
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)
s3_client = boto3.resource('s3')

def clean_s3(event, context):
    LOGGER.info("Received event: %s", event)
    try:
        d = event
        delete_s3_objects(d['FirehoseOutputBucket'])
        return event
    except Exception as e:
        # Trace error
        LOGGER.exception("Error while deleting data from S3.")
        return {"status": "FAILED", "error_message": str(e), "guid": event}

def delete_s3_objects(bucket_name):
    LOGGER.info("Deleting data from bucket: %s", bucket_name)
    bucket = s3_client.Bucket(bucket_name)
    r = bucket.objects.all().delete()
    LOGGER.info("Deleted data from bucket complete: %s, %s", bucket_name, r)
