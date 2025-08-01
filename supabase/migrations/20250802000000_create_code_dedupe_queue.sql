-- Create code_dedupe queue for processing code files
SELECT pgmq.create('code_dedupe');

-- Grant permissions are already set up in the system