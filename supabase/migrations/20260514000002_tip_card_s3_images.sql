-- Assign unique S3 cover images to all tip cards.
-- Images are drawn from the public tb6-mood S3 bucket (dse_chi/ prefix).
-- Each tip card gets a different image number so covers are unique within the set.

UPDATE dsemcq_tip_cards SET image_url = 'https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/2.png' WHERE id = 'tip-1';
UPDATE dsemcq_tip_cards SET image_url = 'https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/6.png' WHERE id = 'tip-2';
UPDATE dsemcq_tip_cards SET image_url = 'https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/4.png' WHERE id = 'tip-3';
UPDATE dsemcq_tip_cards SET image_url = 'https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/1.png' WHERE id = 'tip-4';
UPDATE dsemcq_tip_cards SET image_url = 'https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/5.png' WHERE id = 'tip-5';
UPDATE dsemcq_tip_cards SET image_url = 'https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/3.png' WHERE id = 'tip-6';
